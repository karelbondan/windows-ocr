"use strict";
const screenshot_bt = document.getElementById("screenshot_button");
const enter_bt = document.getElementById("enable_enter");
// temporary function with the download just to test
screenshot_bt.onclick = function (e) {
    e.preventDefault();
    if (draw.offsetWidth > 10 && draw.offsetHeight > 10) {
        const img = document.getElementById("source_img");
        const normalise = img.naturalWidth / listener.clientWidth; // < this the most important shit lol 
        const canvas = document.createElement("canvas");
        canvas.id = "screenshot_canvas";
        canvas.width = draw.offsetWidth * normalise;
        canvas.height = draw.offsetHeight * normalise;
        const context = canvas.getContext("2d");
        context.drawImage(img, get_value(draw.style.left) * normalise, get_value(draw.style.top) * normalise, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
        // temp
        const dummy_a = document.createElement('a');
        dummy_a.href = canvas.toDataURL('image/png', 1).replace("image/png", "image/octet-stream");
        dummy_a.download = "ngentot.png";
        dummy_a.click();
        prompt_popup.style.top = '-5rem';
        overlay.classList.toggle("opacity-0");
        draw.classList.toggle('opacity-0');
        draw.style.top = '0px';
        draw.style.bottom = `${listener.clientHeight}px`;
        draw.style.left = '0px';
        draw.style.right = `${listener.clientWidth}px`;
    }
};
enter_bt.onsubmit = function () {
    screenshot_bt.click();
};
window.onkeydown = function (e) {
    if (e.key == "Enter")
        screenshot_bt.click();
};
