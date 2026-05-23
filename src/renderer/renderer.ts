// @ts-expect-error
window.ocrRenderer.loadImage((val: { imagePath: string, displayId: number, bounds: any, scaleFactor: number }) => {
    if (!val || !val.imagePath) {
        console.warn("loadImage payload missing imagePath");
        return;
    }
    // Stash the display id so listener.ts can include it in selection-started.
    // @ts-expect-error
    window.__ocrDisplayId = val.displayId;
    (document.getElementById("source_img") as HTMLImageElement).src = val.imagePath;
    console.log("Load image success for display", val.displayId);
})