import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

function resolveServiceKey() {
  const modern = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (modern) {
    try {
      const keys = JSON.parse(modern);
      if (keys?.default) return String(keys.default);
    } catch {}
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!legacy) throw new Error("Supabase service key tidak tersedia.");
  return legacy;
}

const SERVICE_KEY = resolveServiceKey();
const SERVICE_KEY_IS_LEGACY_JWT = SERVICE_KEY.startsWith("eyJ");
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

async function sha256(input: string) {
  const bytes = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
}

function isUuid(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function adminFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("apikey", SERVICE_KEY);
  if (SERVICE_KEY_IS_LEGACY_JWT) {
    headers.set("Authorization", `Bearer ${SERVICE_KEY}`);
  } else {
    headers.delete("Authorization");
  }
  headers.set("Content-Type", "application/json");
  const res = await fetch(`${SUPABASE_URL}${path}`, { ...init, headers });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(data?.message || data?.hint || data?.details || `Supabase HTTP ${res.status}`);
  return data;
}

function clientIdentity(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("cf-connecting-ip")
    || req.headers.get("x-real-ip")
    || "unknown";
  const ua = req.headers.get("user-agent") || "unknown";
  return { ip, ua };
}

async function validateSession(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return null;
  const tokenHash = await sha256(token);
  const rows = await adminFetch(`/rest/v1/bakul_pin_sessions?token_hash=eq.${encodeURIComponent(tokenHash)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=token_hash,expires_at&limit=1`);
  if (!Array.isArray(rows) || !rows.length) return null;
  adminFetch(`/rest/v1/bakul_pin_sessions?token_hash=eq.${encodeURIComponent(tokenHash)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ last_seen_at: new Date().toISOString() }),
  }).catch(() => {});
  return { tokenHash, expiresAt: rows[0].expires_at };
}

async function login(req: Request, body: any) {
  const pin = String(body?.pin || "").trim();
  if (!/^\d{4,10}$/.test(pin)) return json({ error: "PIN tidak valid." }, 400);

  const { ip, ua } = clientIdentity(req);
  const ipHash = await sha256(ip);
  const clientKey = await sha256(`${ip}|${ua}`);
  const attempts = await adminFetch(`/rest/v1/bakul_pin_attempts?client_key=eq.${clientKey}&select=*&limit=1`);
  const now = new Date();
  const existing = Array.isArray(attempts) ? attempts[0] : null;
  if (existing?.locked_until && new Date(existing.locked_until) > now) {
    return json({ error: "Terlalu banyak percobaan. Coba lagi beberapa menit." }, 429);
  }

  const cfgRows = await adminFetch("/rest/v1/bakul_pin_config?id=eq.1&select=pin_salt,pin_hash,session_minutes&limit=1");
  const cfg = cfgRows?.[0];
  if (!cfg) return json({ error: "Konfigurasi PIN belum tersedia." }, 500);
  const candidate = await sha256(`${cfg.pin_salt}${pin}`);

  if (candidate !== cfg.pin_hash) {
    const windowStart = existing?.window_started_at ? new Date(existing.window_started_at) : now;
    const resetWindow = (now.getTime() - windowStart.getTime()) > 15 * 60 * 1000;
    const failedCount = resetWindow ? 1 : Number(existing?.failed_count || 0) + 1;
    const lockedUntil = failedCount >= 5 ? new Date(now.getTime() + 10 * 60 * 1000).toISOString() : null;
    await adminFetch("/rest/v1/bakul_pin_attempts?on_conflict=client_key", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        client_key: clientKey,
        failed_count: failedCount,
        window_started_at: resetWindow ? now.toISOString() : (existing?.window_started_at || now.toISOString()),
        locked_until: lockedUntil,
        updated_at: now.toISOString(),
      }),
    });
    return json({ error: failedCount >= 5 ? "PIN salah. Login dikunci 10 menit." : "PIN salah." }, failedCount >= 5 ? 429 : 401);
  }

  await adminFetch(`/rest/v1/bakul_pin_attempts?client_key=eq.${clientKey}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
  await adminFetch(`/rest/v1/bakul_pin_sessions?expires_at=lt.${encodeURIComponent(now.toISOString())}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});

  const token = randomToken();
  const tokenHash = await sha256(token);
  const expiresAt = new Date(now.getTime() + Number(cfg.session_minutes || 480) * 60 * 1000).toISOString();
  await adminFetch("/rest/v1/bakul_pin_sessions", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ token_hash: tokenHash, expires_at: expiresAt, user_agent: ua.slice(0, 500), ip_hash: ipHash }),
  });
  return json({ ok: true, token, expiresAt });
}

async function bootstrap() {
  const [categories, payments, items] = await Promise.all([
    adminFetch("/rest/v1/bakul_categories?select=code,name,sort_order&is_active=eq.true&order=sort_order"),
    adminFetch("/rest/v1/bakul_payment_methods?select=code,name,sort_order&is_active=eq.true&order=sort_order"),
    adminFetch("/rest/v1/bakul_items?select=id,legacy_item_id,category_code,name,unit_default,is_active&is_active=eq.true&order=name&limit=1000"),
  ]);
  return json({ categories, payments, items });
}

async function dashboard(body: any) {
  const month = /^\d{4}-\d{2}$/.test(String(body?.month || "")) ? String(body.month) : new Date().toISOString().slice(0,7);
  return json(await adminFetch("/rest/v1/rpc/bakul_dashboard", {
    method: "POST",
    body: JSON.stringify({ p_month: `${month}-01` }),
  }));
}

async function history(body: any) {
  const page = Math.max(0, Number(body?.page || 0));
  const pageSize = Math.min(100, Math.max(10, Number(body?.pageSize || 30)));
  const q = new URLSearchParams();
  q.set("select","id,transaction_no,transaction_date,category_code,item_name_snapshot,qty,unit,payment_code,total_price,client_mutation_id,created_at");
  q.set("order","transaction_date.desc,created_at.desc");
  q.set("limit",String(pageSize));
  q.set("offset",String(page * pageSize));
  if (body?.category) q.set("category_code",`eq.${body.category}`);
  if (body?.dateFrom) q.set("transaction_date",`gte.${body.dateFrom}`);
  if (body?.dateTo) q.append("transaction_date",`lte.${body.dateTo}`);
  if (body?.search) {
    const s = String(body.search).replace(/[(),]/g," ").trim();
    if (s) q.set("or",`(transaction_no.ilike.*${s}*,item_name_snapshot.ilike.*${s}*)`);
  }
  const rows = await adminFetch(`/rest/v1/bakul_transactions?${q.toString()}`);
  return json({ rows, page, pageSize, hasMore: Array.isArray(rows) && rows.length === pageSize });
}

async function createTransaction(body: any) {
  const payload: Record<string, unknown> = {
    p_date: body?.date,
    p_item_id: body?.itemId,
    p_qty: Number(body?.qty),
    p_unit: body?.unit || "",
    p_payment_code: body?.paymentCode,
    p_total_price: Number(body?.totalPrice),
  };
  let rpc = "bakul_create_transaction_pin";
  if (isUuid(body?.clientMutationId)) {
    rpc = "bakul_create_transaction_offline";
    payload.p_client_mutation_id = body.clientMutationId;
  }
  return json(await adminFetch(`/rest/v1/rpc/${rpc}`, {
    method: "POST",
    body: JSON.stringify(payload),
  }));
}

async function createItem(body: any) {
  return json(await adminFetch("/rest/v1/rpc/bakul_create_item_pin", {
    method: "POST",
    body: JSON.stringify({
      p_category_code: body?.categoryCode,
      p_name: body?.name,
      p_unit_default: body?.unitDefault || "",
    }),
  }));
}

function validDay(v: unknown) {
  if(typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d=new Date(v+"T00:00:00Z");return Number.isFinite(d.valueOf()) && d.toISOString().slice(0,10)===v;
}
async function cashReport(body: any) {
  const {from,to}=body;
  if(!validDay(from)||!validDay(to)||from>to||Date.parse(to)-Date.parse(from)>31*86400000) return json({error:"Rentang tanggal kas tidak valid."},400);
  async function allRows(table: string,order: string) {
    const rows:any[]=[];
    for(let offset=0;offset<100000;offset+=500){
      const q=new URLSearchParams({select:"*",order,limit:"500",offset:String(offset)});
      q.set("day","gte."+from);q.append("day","lte."+to);
      const batch=await adminFetch("/rest/v1/"+table+"?"+q.toString());
      if(!Array.isArray(batch))throw new Error("Data kas tidak valid.");
      rows.push(...batch);if(batch.length<500)return rows;
    }throw new Error("Data kas terlalu banyak.");
  }
  const [days,movements]=await Promise.all([allRows("bakul_cash_days","day.asc"),allRows("bakul_cash_movements","day.asc,created_at.asc,id.asc")]);
  return json({days,movements});
}
async function cashWrite(body: any) {
  const {day,kind,id}=body,amount=body?.amount,note=String(body?.note||"").trim();
  if(!validDay(day)||!["opening","actual","addition","transfer_in","transfer_out"].includes(kind)||typeof amount!=="number"||!Number.isSafeInteger(amount)||amount<0||amount>999999999999||note.length>200)return json({error:"Data kas tidak valid."},400);
  if(kind==="opening"||kind==="actual"){
    const patch:Record<string,unknown>={day,updated_at:new Date().toISOString()};
    if(kind==="opening"){patch.opening=amount;patch.opening_note=note;}
    else{patch.actual=amount;patch.actual_note=note;patch.counted_at=new Date().toISOString();}
    await adminFetch("/rest/v1/bakul_cash_days?on_conflict=day",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal,missing=default"},body:JSON.stringify(patch)});
  }else{
    if(!isUuid(id)||amount===0||!note)return json({error:"Nominal dan tujuan pemindahan/tambahan wajib diisi."},400);
    await adminFetch("/rest/v1/bakul_cash_movements?on_conflict=id",{method:"POST",headers:{Prefer:"resolution=ignore-duplicates,return=minimal"},body:JSON.stringify({id,day,kind,amount,note})});
  }
  return json({ok:true});
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");
    if (action === "login") return await login(req, body);

    const session = await validateSession(req);
    if (!session) return json({ error: "Sesi PIN tidak valid atau sudah berakhir." }, 401);

    if (action === "logout") {
      await adminFetch(`/rest/v1/bakul_pin_sessions?token_hash=eq.${session.tokenHash}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      return json({ ok: true });
    }
    if (action === "bootstrap") return await bootstrap();
    if (action === "dashboard") return await dashboard(body);
    if (action === "history") return await history(body);
    if (action === "create_transaction") return await createTransaction(body);
    if (action === "create_item") return await createItem(body);
    if (action === "cash_report") return await cashReport(body);
    if (action === "cash_write") return await cashWrite(body);
    return json({ error: "Aksi tidak dikenal." }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : "Terjadi kesalahan server." }, 500);
  }
});
