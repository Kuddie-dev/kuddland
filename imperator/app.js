const { createClient } = supabase;

const sb = createClient(
  "https://sycicazqcbwwhejxmvrw.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5Y2ljYXpxY2J3d2hlanhtdnJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MjU1MTksImV4cCI6MjA5MzUwMTUxOX0.kfW50nDeEBiSrHinDe9GXJkOuNWWq92eKd32DQf3HOI"
);

let me = null;
let adminProfile = null;

const $ = (id) => document.getElementById(id);

async function init() {
  $("loginBtn").onclick = login;
  $("logoutBtn").onclick = logout;
  $("reloadUsersBtn").onclick = loadUsers;
  $("reloadPostsBtn").onclick = loadPosts;

  const { data } = await sb.auth.getSession();
  me = data.session?.user ?? null;

  if (me) {
    await verifyImperator();
  } else {
    showLogin();
  }
}

function showLogin() {
  $("loginView").classList.remove("hidden");
  $("adminView").classList.add("hidden");
}

function showAdmin() {
  $("loginView").classList.add("hidden");
  $("adminView").classList.remove("hidden");
}

async function login() {
  const email = $("emailInput").value.trim();
  const password = $("passwordInput").value;

  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return alert(error.message);

  location.reload();
}

async function logout() {
  await sb.auth.signOut();
  location.reload();
}

async function verifyImperator() {
  const { data, error } = await sb.from("profiles").select("*").eq("id", me.id).single();
  if (error) return alert(error.message);

  adminProfile = data;
  $("adminBox").textContent = `${adminProfile.username} · ${adminProfile.role}`;

  if (adminProfile.role !== "imperator") {
    document.body.innerHTML = "<h1>Access denied</h1><p>This panel is for the Imperator only.</p>";
    return;
  }

  showAdmin();
  await loadUsers();
  await loadPosts();
}

async function loadUsers() {
  const { data, error } = await sb.from("profiles").select("*").order("created_at", { ascending: false });
  if (error) return alert(error.message);

  $("usersList").innerHTML = (data || []).map((u) => `
    <div class="card">
      <p><strong>${u.username}</strong></p>
      <p>role: ${u.role}</p>
      <p>warnings: ${u.warnings}</p>
      <p>banned: ${u.banned}</p>
      <select id="role-${u.id}">
        <option value="citizen">citizen</option>
        <option value="modletariat">modletariat</option>
        <option value="council">council</option>
        <option value="imperator">imperator</option>
      </select>
      <button onclick="setRole('${u.id}')">Set Role</button>
      <button onclick="warnUser('${u.id}')">Add Warning</button>
      <button onclick="banUser('${u.id}')">Ban</button>
      <button onclick="unbanUser('${u.id}')">Unban</button>
    </div>
  `).join("");
}

async function loadPosts() {
  const { data, error } = await sb.from("posts").select("*").order("created_at", { ascending: false });
  if (error) return alert(error.message);

  $("postsList").innerHTML = (data || []).map((p) => `
    <div class="card">
      <p><strong>${p.title}</strong></p>
      <p>board: ${p.board_slug}</p>
      <img src="${p.image_url}" alt="${p.title}" style="max-width:100%" />
      <button onclick="deletePost('${p.id}')">Delete Post</button>
    </div>
  `).join("");
}

async function setRole(userId) {
  const select = document.getElementById(`role-${userId}`);
  const role = select.value;

  const { data: target } = await sb.from("profiles").select("*").eq("id", userId).single();
  if (!target) return;

  if (target.role === "imperator" && role !== "imperator") {
    return alert("You cannot demote the Imperator from this protection rule.");
  }

  await sb.from("profiles").update({ role }).eq("id", userId);
  await loadUsers();
}

async function warnUser(userId) {
  const { data: target } = await sb.from("profiles").select("*").eq("id", userId).single();
  if (!target) return;

  if (target.role === "imperator") return alert("You cannot warn the Imperator.");

  const warnings = (target.warnings || 0) + 1;
  const banned = warnings >= 5;

  await sb.from("profiles").update({ warnings, banned }).eq("id", userId);
  await loadUsers();
}

async function banUser(userId) {
  const { data: target } = await sb.from("profiles").select("*").eq("id", userId).single();
  if (!target) return;

  if (target.role === "imperator") return alert("You cannot ban the Imperator.");

  await sb.from("profiles").update({ banned: true }).eq("id", userId);
  await loadUsers();
}

async function unbanUser(userId) {
  await sb.from("profiles").update({ banned: false }).eq("id", userId);
  await loadUsers();
}

async function deletePost(postId) {
  await sb.from("posts").delete().eq("id", postId);
  await loadPosts();
}

window.setRole = setRole;
window.warnUser = warnUser;
window.banUser = banUser;
window.unbanUser = unbanUser;
window.deletePost = deletePost;

init();
