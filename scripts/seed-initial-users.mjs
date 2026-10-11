/* One-time local/server setup. Never expose SUPABASE_SERVICE_ROLE_KEY to a browser. */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY outside the repository.");
const client = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const accounts = [
  { identifier: "dueño", email: "dueno@laestancia.local", password: "123123", role: "owner", displayName: "dueño" },
  { identifier: "admin", email: "admin@laestancia.local", password: "123123", role: "admin", displayName: "admin" },
  { identifier: "empleado", email: "empleado@laestancia.local", password: "111111", role: "staff", displayName: "empleado" },
];
async function userForEmail(email) {
  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
    if (user) return user;
    if (data.users.length < 1000) return null;
  }
}
const { data: businesses, error: businessError } = await client.from("businesses").select("id,name").ilike("name", "La Estancia").limit(2);
if (businessError) throw businessError;
if (businesses.length !== 1) throw new Error(`Expected exactly one business named La Estancia; found ${businesses.length}. No user was changed.`);
const business = businesses[0];
for (const account of accounts) {
  let user = await userForEmail(account.email);
  if (!user) {
    const { data, error } = await client.auth.admin.createUser({ email: account.email, password: account.password, email_confirm: true, user_metadata: { display_name: account.displayName, login_identifier: account.identifier } });
    if (error) throw new Error(`Could not create ${account.identifier}. The configured Auth password policy rejected or blocked it: ${error.message}`);
    user = data.user;
  }
  const { error: profileError } = await client.from("profiles").upsert({ id: user.id, display_name: account.displayName });
  if (profileError) throw profileError;
  const { error: membershipError } = await client.from("business_memberships").upsert({ business_id: business.id, user_id: user.id, role: account.role, is_active: true }, { onConflict: "business_id,user_id" });
  if (membershipError) throw membershipError;
  console.log(`${account.identifier}: ready for ${business.name}`);
}
const { data: branches, error: branchError } = await client.from("branches").select("name,is_active").eq("business_id", business.id).order("name");
if (branchError) throw branchError;
console.log(`Existing branches inspected: ${branches.map((branch) => `${branch.name}${branch.is_active ? "" : " (inactive)"}`).join(", ") || "none"}.`);
console.log("There is no branch-membership table in the current schema, so these accounts retain the existing business-wide branch rule.");
