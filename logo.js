const legacy = document.cookie.split(";").some(c => c.trim() === "lbtLogoMode=legacy");
const name = legacy ? "friends" : "logo";

const icon = document.querySelector('link[rel="icon"]');
const appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
const logo = document.querySelector(".logo");
const toggle = document.getElementById("logoMode");

if (icon) icon.href = `/assets/${name}.png`;
if (appleIcon) appleIcon.href = `/assets/${name}_180.png`;
if (logo) logo.src = `/assets/${name}.png`;

if (toggle) {
  toggle.textContent = legacy ? "current" : "legacy";
  toggle.addEventListener("click", event => {
    event.preventDefault();
    document.cookie = `lbtLogoMode=legacy; Domain=lbtrading.com; Path=/; Max-Age=${legacy ? 0 : 31536000}; Secure; SameSite=Lax`;
    location.reload();
  });
}