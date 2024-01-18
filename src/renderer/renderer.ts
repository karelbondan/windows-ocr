// @ts-expect-error
window.ocrRenderer.loadImage((val) => {
    // @ts-expect-error
    (document.getElementById("source_img") as HTMLImageElement).src = window.ocrRenderer.tempImageLoc();
    console.log("Load image success");
})