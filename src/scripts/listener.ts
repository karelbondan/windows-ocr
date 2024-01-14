listener.onmousedown = (e) => {
    if (!draw.className.split(' ').includes("pointer-events-none"))
        draw.classList.toggle("pointer-events-none");

    const ns = "http://www.w3.org/2000/svg";
    let closeIconPath = document.createElementNS(ns, "path");
    closeIconPath.setAttribute("d",
    `M0,0
    L0,${listener.clientHeight}
    L${listener.clientWidth},${listener.clientHeight}
    L${listener.clientWidth},0 Z`
    );
    clipPath.replaceChild(closeIconPath, clipPath.childNodes[1]);

    prompt_popup.style.top = '-5rem';
    prompt_popup.classList.add('delay-500');
    prompt_wrapper.classList.remove('w-[437px]');
    prompt_wrapper.classList.add('w-[363px]');
    prompt_wrapper.classList.remove('delay-500')

    draw.setAttribute('style', '');
    initialPoints.length = 0;
    initialPoints.push(e.x)
    initialPoints.push(e.y)

    draw.style.left = String(initialPoints[0]) + "px";
    draw.style.top = String(initialPoints[1]) + "px";
    isDragging = false;
    isCreatingRectangle = true;
}

listener.onmouseup = (e) => {
    if (!isDragging){
        draw.classList.toggle("pointer-events-none");
    }
    prompt_popup.style.top = '1rem';
    prompt_popup.classList.remove('delay-500');
    if (draw.offsetHeight > 10 && draw.offsetWidth > 10) {
        prompt_wrapper.classList.add('w-[437px]');
        prompt_wrapper.classList.remove('w-[363px]');
        prompt_wrapper.classList.add('delay-500')
    }
    isCreatingRectangle = false;
}

listener.onmousemove = (e) => {
    if (isCreatingRectangle) {
        let right = listener.clientWidth - e.x
        let bottom = listener.clientHeight - e.y

        const ns = "http://www.w3.org/2000/svg";
        let closeIconPath = document.createElementNS(ns, "path");
        if (e.x < initialPoints[0] && e.y > initialPoints[1] || 
            e.x > initialPoints[0] && e.y < initialPoints[1]) 
            closeIconPath.setAttribute("d",
                `M0,0 
                L0,${listener.clientHeight} 
                L${initialPoints[0]},${listener.clientHeight} 
                L${initialPoints[0]},${e.y} 
                L${e.x},${e.y} 
                L${e.x},${initialPoints[1]} 
                L${initialPoints[0]},${initialPoints[1]} 
                L${initialPoints[0]},${listener.clientHeight} 
                L${listener.clientWidth},${listener.clientHeight} 
                L${listener.clientWidth},0 Z`
            );
        else 
            closeIconPath.setAttribute("d",
                `M0,0 
                L0,${listener.clientHeight} 
                L${initialPoints[0]},${listener.clientHeight} 
                L${initialPoints[0]},${initialPoints[1]} 
                L${e.x},${initialPoints[1]} 
                L${e.x},${e.y} 
                L${initialPoints[0]},${e.y} 
                L${initialPoints[0]},${listener.clientHeight} 
                L${listener.clientWidth},${listener.clientHeight} 
                L${listener.clientWidth},0 Z`
            );
        clipPath.replaceChild(closeIconPath, clipPath.childNodes[1]);

        if (e.x < initialPoints[0]) {
            draw.style.right = String(listener.clientWidth - initialPoints[0]) + "px";
            draw.style.left = String(e.x) + "px";
        } else {
            draw.style.left = String(initialPoints[0]) + "px";
            draw.style.right = String(right) + "px";
        }

        if (e.y < initialPoints[1]) {
            draw.style.bottom = String(listener.clientHeight - initialPoints[1]) + "px";
            draw.style.top = String(e.y) + "px";
        } else {
            draw.style.top = String(initialPoints[1]) + "px";
            draw.style.bottom = String(bottom) + "px";
        }
    } else if (isDragging)
        move_rectangle(e, draw); // ensure rectangle keeps moving when cursor loses focus while dragging.
}