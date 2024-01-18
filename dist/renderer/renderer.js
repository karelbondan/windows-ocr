"use strict";
// @ts-expect-error
window.ocrRenderer.loadImage((val) => {
    // @ts-expect-error
    document.getElementById("source_img").src = window.ocrRenderer.tempImageLoc();
    console.log("Load image success");
});
