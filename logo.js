const legacy = localStorage.getItem("logoMode") === "legacy";
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

    if (legacy) localStorage.removeItem("logoMode");
    else localStorage.setItem("logoMode", "legacy");

    location.reload();
  });
}