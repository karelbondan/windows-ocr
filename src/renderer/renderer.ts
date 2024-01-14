// @ts-expect-error
(document.getElementById("source_img") as HTMLImageElement).src = path.join(os.tmpdir(), 'windowsocrtemp.png');