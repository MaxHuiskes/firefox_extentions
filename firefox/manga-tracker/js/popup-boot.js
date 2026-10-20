// Runs before CSS/layout — never use popup-width media queries (resize loop).
if (/Android/i.test(navigator.userAgent) || screen.width <= 480) {
  document.documentElement.classList.add("is-mobile");
}
