"use strict";
// @ts-expect-error
document.getElementById("source_img").src = path.join(os.tmpdir(), 'windowsocrtemp.png');
