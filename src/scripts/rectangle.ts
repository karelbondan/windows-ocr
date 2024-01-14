draw.onmousedown = (e) => {
    draw.classList.remove("cursor-grab");
    draw.classList.add("cursor-grabbing");

    prompt_popup.style.top = '-5rem';
    const drawProperty = window.getComputedStyle(draw)

    initDragPoints.top = get_value(drawProperty.top)
    initDragPoints.bottom = get_value(drawProperty.bottom)
    initDragPoints.right = get_value(drawProperty.right)
    initDragPoints.left = get_value(drawProperty.left)

    dragPoints.length = 0;
    dragPoints.push(e.x);
    dragPoints.push(e.y);

    isDragging = true;
}

draw.onmousemove = (e) => {
    if (isDragging) move_rectangle(e, draw);
}

draw.onmouseup = (e) => {
    draw.classList.add("cursor-grab");
    draw.classList.remove("cursor-grabbing");
    prompt_popup.style.top = '1rem';
    isDragging = false;
}