"use strict";
// let rectangle_area = document.getElementById("draw")! as HTMLDivElement;
// let prompt_wrapper = document.getElementById("prompt_wrapper")! as HTMLDivElement;
// // w-[23.5%] hover:w-[28.5%] 
// let observer = new MutationObserver(function (event) {
// let is_active = window.getComputedStyle(rectangle_area);
// console.log(is_active.top, is_active.left, is_active.bottom, is_active.right);
// // if (prompt_wrapper.className.split(' ').includes("w-[23.5%]")){
// //     prompt_wrapper.classList.toggle("delay-500");
// // }
// if ((rectangle_area.offsetWidth > 10 || rectangle_area.offsetHeight > 10) && prompt_wrapper.className.split(' ').includes("w-[23.5%]")){
//     prompt_wrapper.classList.toggle('w-[28.5%]');
//     prompt_wrapper.classList.toggle('w-[23.5%]');
// }
// else if ((rectangle_area.offsetWidth < 10 || rectangle_area.offsetHeight < 10) && prompt_wrapper.className.split(' ').includes("w-[28.5%]")){
//     prompt_wrapper.classList.toggle('w-[28.5%]');
//     prompt_wrapper.classList.toggle('w-[23.5%]');
// }
// console.log(rectangle_area.offsetWidth, rectangle_area.offsetHeight);
// console.log(is_active.bottom, is_active.right)
// if (prompt_wrapper.className.split(' ').includes("active")) {
//     prompt_wrapper.style.top = '1rem'
// } else {
//     prompt_wrapper.style.top = `-5rem`
// }
// })
// observer.observe(rectangle_area, {
// attributes: true, 
// attributeFilter: ['style'],
// childList: false, 
// characterData: false
// })
// // let snipping_prompt = document.getElementById("prompt")! as HTMLDivElement
// // let hasChanged = false;
// // let observer = new MutationObserver(function (event) {
// //     let is_active = snipping_prompt.className.split(' ');
// //     if (!hasChanged){
// //         if (is_active.includes("active")){
// //             snipping_prompt.className = "active absolute translate-y-0 transition-all"
// //         } else {
// //             snipping_prompt.className = "absolute -translate-y-96 transition-all"
// //         }
// //         hasChanged = true;
// //         setTimeout(() => {
// //             hasChanged = false;
// //         }, 10);
// //     }
// // })
// // observer.observe(snipping_prompt, {
// // attributes: true, 
// // attributeFilter: ['class'],
// // childList: false, 
// // characterData: false
// // })
// // // snipping_prompt.onclick = (e) => {
// // //     e.preventDefault();
// // //     if (!snipping_active)
// // //         snipping_active = true;
// // //     else   
// // //         snipping_active = false;
// // //     if (snipping_active){
// // //     }
// // // }
