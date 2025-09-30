"use strict";
// @ts-expect-error
window.ocrRenderer.loadImage((displayID) => {
    // @ts-expect-error
    document.getElementById("source_img").src = window.ocrRenderer.tempImageLoc(displayID);
    console.log("Load image success");
});
