const { createClient } = supabase;

const sb = createClient(
  "https://sycicazqcbwwhejxmvrw.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5Y2ljYXpxY2J3d2hlanhtdnJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MjU1MTksImV4cCI6MjA5MzUwMTUxOX0.kfW50nDeEBiSrHinDe9GXJkOuNWWq92eKd32DQf3HOI"
);

let me = null;
let profile = null;
let boards = [];
let activeBoard = "all";

const $ = (id) => document.getElementById(id);

async function init() {
  await loadBoards();

  const { data } = await sb.auth.getSession();
  me = data.session?.user ?? null;

  if (me) {
    await ensureProfile();
    await loadProfile();
    showApp();
    bindApp();
    await renderEverything();
  } else {
    showAuth();
    bindAuth();
  }
}

function showAuth() {
  $("authView").classList.remove("hidden");
  $("appView").classList.add("hidden");
}

function showApp() {
  $("authView").classList.add("hidden");
  $("appView").classList.remove("hidden");
}

function bindAuth() {
  $("registerForm").onsubmit = registerUser;
  $("loginForm").onsubmit = loginUser;
}

function bindApp() {
  $("logoutBtn").onclick = logoutUser;
  $("postBtn").onclick = createPost;
  $("saveProfileBtn").onclick = saveProfile;
}

async function registerUser(e) {
  e.preventDefault();

  const username = $("regUsername").value.trim();
  const email = $("regEmail").value.trim();
  const password = $("regPassword").value;

  if (!username || !email || !password) return alert("Fill all register fields.");

  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: {
      data: { username }
    }
  });

  if (error) return alert(error.message);

  if (data.user) {
    await sb.from("profiles").insert({
      id: data.user.id,
      username,
      role: "citizen",
      bio: "",
      avatar_url: "",
      banner_url: "",
      warnings: 0,
      banned: false
    });
  }

  alert("Account created. Login now.");
}

async function loginUser(e) {
  e.preventDefault();

  const email = $("logEmail").value.trim();
  const password = $("logPassword").value;

  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return alert(error.message);

  location.reload();
}

async function logoutUser() {
  await sb.auth.signOut();
  location.reload();
}

async function loadBoards() {
  const { data, error } = await sb
    .from("boards")
    .select("*")
    .eq("is_active", true)
    .order("title");

  if (error) {
    alert(error.message);
    return;
  }

  boards = data || [];
  renderBoards();
}

function renderBoards() {
  const buttons = [`<button data-board="all">All</button>`].concat(
    boards.map((b) => `<button data-board="${b.slug}">${b.title}</button>`)
  );

  $("boardButtons").innerHTML = buttons.join("");
  $("boardSelect").innerHTML = `<option value="all">All</option>` + boards.map(
    (b) => `<option value="${b.slug}">${b.title}</option>`
  ).join("");

  $("boardButtons").querySelectorAll("button").forEach((btn) => {
    btn.onclick = async () => {
      activeBoard = btn.dataset.board;
      await renderFeed();
    };
  });
}

async function ensureProfile() {
  const { data } = await sb.from("profiles").select("*").eq("id", me.id).maybeSingle();

  if (!data) {
    const username = me.user_metadata?.username || me.email.split("@")[0];
    await sb.from("profiles").insert({
      id: me.id,
      username,
      role: "citizen",
      bio: "",
      avatar_url: "",
      banner_url: "",
      warnings: 0,
      banned: false
    });
  }
}

async function loadProfile() {
  const { data, error } = await sb.from("profiles").select("*").eq("id", me.id).single();
  if (error) return alert(error.message);

  profile = data;
  $("bioInput").value = profile.bio || "";
  $("meBox").textContent = `${profile.username} · ${profile.role} · warnings: ${profile.warnings}`;

  $("profilePreview").innerHTML = `
    ${profile.banner_url ? `<img src="${profile.banner_url}" alt="banner" />` : ""}
    <p><strong>${profile.username}</strong></p>
    ${profile.avatar_url ? `<img src="${profile.avatar_url}" alt="avatar" style="max-width:120px" />` : ""}
  `;
}

async function uploadToStorage(file, prefix) {
  const path = `${me.id}/${prefix}/${Date.now()}-${file.name}`;

  const { error: uploadError } = await sb.storage
    .from("images")
    .upload(path, file, { upsert: false });

  if (uploadError) throw uploadError;

  const { data } = sb.storage.from("images").getPublicUrl(path);
  return data.publicUrl;
}

async function saveProfile() {
  try {
    let avatar_url = profile.avatar_url;
    let banner_url = profile.banner_url;

    const avatarFile = $("avatarFile").files[0];
    const bannerFile = $("bannerFile").files[0];

    if (avatarFile) avatar_url = await uploadToStorage(avatarFile, "avatar");
    if (bannerFile) banner_url = await uploadToStorage(bannerFile, "banner");

    const bio = $("bioInput").value.trim();

    const { error } = await sb.from("profiles").update({
      bio,
      avatar_url,
      banner_url
    }).eq("id", me.id);

    if (error) throw error;

    await loadProfile();
    alert("Profile saved.");
  } catch (err) {
    alert(err.message);
  }
}

async function createPost() {
  try {
    const board_slug = $("boardSelect").value;
    const title = $("titleInput").value.trim();
    const tags = $("tagsInput").value
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const file = $("imageInput").files[0];
    if (!title || !file) return alert("Title and image are required.");
    if (board_slug === "all") return alert("Pick a real board.");

    const image_url = await uploadToStorage(file, "posts");

    const { error } = await sb.from("posts").insert({
      author_id: me.id,
      board_slug,
      title,
      image_url,
      tags,
      likes: 0,
      deleted: false
    });

    if (error) throw error;

    $("titleInput").value = "";
    $("tagsInput").value = "";
    $("imageInput").value = null;

    await renderEverything();
  } catch (err) {
    alert(err.message);
  }
}

async function renderEverything() {
  await renderFeed();
}

async function renderFeed() {
  let query = sb
    .from("posts")
    .select("*")
    .eq("deleted", false)
    .order("created_at", { ascending: false });

  if (activeBoard !== "all") {
    query = query.eq("board_slug", activeBoard);
  }

  const { data: posts, error } = await query;
  if (error) return alert(error.message);

  const authorIds = [...new Set((posts || []).map((p) => p.author_id))];

  let authors = [];
  if (authorIds.length) {
    const res = await sb
      .from("profiles")
      .select("id, username, avatar_url, role")
      .in("id", authorIds);

    authors = res.data || [];
  }

  const authorMap = Object.fromEntries(authors.map((a) => [a.id, a]));
  const canModerate = profile && ["imperator", "council", "modletariat"].includes(profile.role);

  $("feed").innerHTML = (posts || []).map((post) => {
    const author = authorMap[post.author_id] || { username: "unknown", avatar_url: "", role: "" };

    return `
      <div class="card">
        <p><strong>${post.title}</strong></p>
        <p>by ${author.username} · board: ${post.board_slug} · likes: ${post.likes}</p>
        ${author.avatar_url ? `<img src="${author.avatar_url}" alt="avatar" style="max-width:64px" />` : ""}
        <img src="${post.image_url}" alt="${post.title}" />
        <p>${(post.tags || []).map((t) => `#${t}`).join(" ")}</p>
        <button onclick="likePost('${post.id}', ${post.likes})">Like</button>
        ${canModerate ? `<button onclick="deletePost('${post.id}')">Delete</button>` : ""}
        ${canModerate ? `<button onclick="warnAuthor('${post.author_id}')">Warning</button>` : ""}
        ${canModerate ? `<button onclick="banAuthor('${post.author_id}')">Ban</button>` : ""}
      </div>
    `;
  }).join("");
}

async function likePost(postId, currentLikes) {
  const { data: liked } = await sb
    .from("post_likes")
    .select("post_id")
    .eq("post_id", postId)
    .eq("user_id", me.id)
    .maybeSingle();

  if (liked) {
    await sb.from("post_likes").delete().eq("post_id", postId).eq("user_id", me.id);
    await sb.from("posts").update({ likes: Math.max(0, currentLikes - 1) }).eq("id", postId);
  } else {
    await sb.from("post_likes").insert({ post_id: postId, user_id: me.id });
    await sb.from("posts").update({ likes: currentLikes + 1 }).eq("id", postId);
  }

  await renderFeed();
}

async function deletePost(postId) {
  await sb.from("posts").delete().eq("id", postId);
  await renderFeed();
}

async function warnAuthor(authorId) {
  const { data: target } = await sb.from("profiles").select("*").eq("id", authorId).single();

  if (!target) return;

  if (target.role === "imperator") return alert("You cannot warn the Imperator.");

  const newWarnings = (target.warnings || 0) + 1;
  const banned = newWarnings >= 5;

  await sb.from("profiles").update({
    warnings: newWarnings,
    banned
  }).eq("id", authorId);

  alert(`Warning added. Total warnings: ${newWarnings}`);
}

async function banAuthor(authorId) {
  const { data: target } = await sb.from("profiles").select("*").eq("id", authorId).single();

  if (!target) return;
  if (target.role === "imperator") return alert("You cannot ban the Imperator.");

  await sb.from("profiles").update({ banned: true }).eq("id", authorId);
  alert("User banned.");
}

window.likePost = likePost;
window.deletePost = deletePost;
window.warnAuthor = warnAuthor;
window.banAuthor = banAuthor;

init();
