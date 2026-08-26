import postgres from "postgres";

let sqlClient: postgres.Sql | null = null;

export function getDb() {
  if (!sqlClient) {
    const connectionString = process.env.POSTGRES_URL;
    if (!connectionString) throw new Error("POSTGRES_URL is not set");
    // POSTGRES_URL goes through Supabase's PgBouncer pooler in transaction mode, which can
    // route each query in a session to a different backend connection. postgres.js's default
    // prepared statements get cached per-connection, so a later query can hit a connection
    // that never prepared it ("prepared statement ... does not exist"). Disable them here.
    sqlClient = postgres(connectionString, { ssl: "require", prepare: false });
  }
  return sqlClient;
}

export async function logActivity(params: {
  actorName: string;
  actorRole?: string;
  action: string;
  detail?: string;
  scopeKey?: string;
}) {
  const sql = getDb();
  await sql`
    insert into activity_log (actor_name, actor_role, action, detail, scope_key)
    values (${params.actorName}, ${params.actorRole ?? null}, ${params.action}, ${params.detail ?? null}, ${params.scopeKey ?? null})
  `;
}
