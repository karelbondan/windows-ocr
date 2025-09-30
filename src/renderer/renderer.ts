// @ts-expect-error
window.ocrRenderer.loadImage((displayID: number) => {
    // @ts-expect-error
    (document.getElementById("source_img") as HTMLImageElement).src = window.ocrRenderer.tempImageLoc(displayID);
    console.log("Load image success");
})