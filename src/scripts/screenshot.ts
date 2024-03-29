screenshot_bt.onclick = async function (e) {
    e.preventDefault();
    if (draw.offsetWidth > 10 && draw.offsetHeight > 10) {
        window.onkeydown = null;
        const img = document.getElementById("source_img") as HTMLImageElement;
        const normalise = img.naturalWidth / listener.clientWidth // < this the most important shit lol 

        const canvas = document.createElement("canvas");
        canvas.id = "screenshot_canvas";
        canvas.width = draw.offsetWidth * normalise;
        canvas.height = draw.offsetHeight * normalise;

        const context = canvas.getContext("2d");
        context!.drawImage(img, get_value(draw.style.left) * normalise, get_value(draw.style.top) * normalise,
            canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);

        prompt_wrapper.classList.toggle('delay-500');
        prompt_wrapper.style.width = '55px';
        rich_description.style.marginLeft = '-380px';
        screenshot_bt.replaceChild(spinner, screenshot_bt.childNodes[1]);
        screenshot_bt.disabled = true;
        spinner.classList.toggle('hidden');

        // @ts-expect-error
        window.ocrRenderer.exportImageAndDoOCR(canvas.toDataURL('image/png', 1))
            // @ts-expect-error
            .then(result => {
                if (result.error) {
                    throw result.error;
                }
                console.log("OCR completed successfully");
                navigator.clipboard.writeText(result[0].fullTextAnnotation.text);
                // @ts-expect-error
                window.ocrRenderer.writeTextToFile(result[0].fullTextAnnotation.text);
                close_window();
            }
                // @ts-expect-error
            ).catch(err => {
                close_window(err.toString());
                // @ts-expect-error
                window.ocrRenderer.spawnError(
                    `Something happened while trying to perform the OCR. The detailed error message is as follows:\n\n${err.toString()}`);
            });
    }
};

enter_bt.onsubmit = function () {
    screenshot_bt.click();
};

window.onkeydown = function (e) {
    if (e.key === "Enter") screenshot_bt.click()
    if (e.key === "Escape") close_window('', true);
};