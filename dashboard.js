import { requireAuth, renderDashboard, signOut } from "./app.js";

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await requireAuth("/login.html");
  } catch (_) {}

  await renderDashboard();

  document.querySelector("#logoutBtn").onclick = () => {
    signOut();
    window.location.href = "/index.html";
  };
});
