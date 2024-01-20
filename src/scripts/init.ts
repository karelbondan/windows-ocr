const container = document.getElementById("container_all") as HTMLDivElement;
const listener = document.getElementById("listener")! as HTMLDivElement;
const draw = document.getElementById("draw")! as HTMLDivElement;
const overlay = document.getElementById("overlay")! as HTMLDivElement;
const spinner = document.getElementById("spinner")! as HTMLDivElement;
const prompt_popup = document.getElementById("prompt")! as HTMLDivElement;
const prompt_wrapper = document.getElementById("prompt_wrapper")! as HTMLDivElement;
const prompt_separator = document.getElementById("prompt_separator")! as HTMLDivElement;
const prompt_bt = document.getElementById("prompt_bt")! as HTMLButtonElement;
const rich_description = document.getElementById("rich_description")! as HTMLParagraphElement;
const clipPath = document.getElementById("clip_path")!;
const screenshot_bt = document.getElementById("screenshot_button") as HTMLButtonElement;
const enter_bt = document.getElementById("enable_enter") as HTMLFormElement;

let isCreatingRectangle = false;
let isDragging = false;
let initialPoints: number[] = [];
let dragPoints: number[] = [];
let initDragPoints = {
    top: 0,
    bottom: 0,
    left: 0,
    right: 0
};

function get_value(input: string): number {
    return parseInt(/[-]*[0-9\.]+/.exec(input)![0])
}

function get_lowest(arr_input: string[], obj_compare: {}): string {
    return arr_input.reduce((key, v) => {
        if (obj_compare[v as keyof typeof obj_compare] < obj_compare[key as keyof typeof obj_compare])
            return v;
        else
            return key;
    });
}

function move_rectangle(e: MouseEvent, draw: HTMLDivElement): void {
    let currentX = dragPoints[0] - e.x
    let currentY = dragPoints[1] - e.y

    const points = {
        top: initDragPoints.top - currentY,
        bottom: initDragPoints.bottom + currentY,
        left: initDragPoints.left - currentX,
        right: initDragPoints.right + currentX
    }

    if (points.top > 0 && points.bottom > 0) {
        draw.style.top = `${points.top}px`;
        draw.style.bottom = `${points.bottom}px`;
    }
    // cheap solution to ensure the lowest attribute always be set to 0px 
    // whenever the calculation result is negative 
    else {
        draw.style[get_lowest(["top", "bottom"], points) as any] = '0px';
    }
    if (points.left > 0 && points.right > 0) {
        draw.style.left = `${points.left}px`;
        draw.style.right = `${points.right}px`;
    }
    else {
        draw.style[get_lowest(["left", "right"], points) as any] = '0px';
    }

    const ns = "http://www.w3.org/2000/svg";
    let closeIconPath = document.createElementNS(ns, "path");
    closeIconPath.setAttribute("d",
        `M0,0 
        L0,${listener.clientHeight} 
        L${get_value(draw.style.left)},${listener.clientHeight} 
        L${get_value(draw.style.left)},${get_value(draw.style.top)} 
        L${listener.clientWidth - get_value(draw.style.right)},${get_value(draw.style.top)} 
        L${listener.clientWidth - get_value(draw.style.right)},${listener.clientHeight - get_value(draw.style.bottom)} 
        L${get_value(draw.style.left)},${listener.clientHeight - get_value(draw.style.bottom)} 
        L${get_value(draw.style.left)},${listener.clientHeight} 
        L${listener.clientWidth},${listener.clientHeight} 
        L${listener.clientWidth},0 Z`
    );
    clipPath.replaceChild(closeIconPath, clipPath.childNodes[1]);
}

function close_window(err: string = "", esc: boolean = false) {
    prompt_popup.style.top = '-5rem';
    overlay.classList.toggle("opacity-0");
    draw.classList.toggle('opacity-0');
    draw.style.top = '0px';
    draw.style.bottom = `${listener.clientHeight}px`;
    draw.style.left = '0px';
    draw.style.right = `${listener.clientWidth}px`;

    setTimeout(() => {
        // @ts-expect-error
        window.ocrRenderer.closeWindow(err, esc);
    }, 550);
}

setTimeout(() => {
    const ns = "http://www.w3.org/2000/svg";
    let closeIconPath = document.createElementNS(ns, "path");
    closeIconPath.setAttribute("d",
        `M0,0
    L0,${listener.clientHeight}
    L${listener.clientWidth},${listener.clientHeight}
    L${listener.clientWidth},0 Z`
    );
    clipPath.replaceChild(closeIconPath, clipPath.childNodes[1]);

    prompt_popup.style.top = '1rem';
    overlay.classList.toggle("opacity-0");
    draw.classList.toggle('opacity-0');
}, 1000);