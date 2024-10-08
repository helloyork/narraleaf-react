import {ElementProp, ITransition} from "@core/elements/transition/type";
import {Base} from "@core/elements/transition/base";
import {Scene} from "@core/elements/scene";
import {StaticImageData} from "@core/types";
import {Utils} from "@core/common/Utils";
import {getCallStack} from "@lib/util/data";

type FadeInElementProps = {
    opacity: number;
    transform: string;
}

type FadeInProps = {
    style?: Partial<{
        opacity: number;
        transform: string;
    }>,
    src?: string;
}

export class FadeIn extends Base<FadeInProps> implements ITransition {
    __stack: string;
    private readonly duration: number;
    private readonly direction: "left" | "right" | "top" | "bottom";
    private readonly offset: number;
    private state: FadeInElementProps = {
        opacity: 0,
        transform: ""
    };
    private src: string | undefined;

    /**
     * The current image will fade out, and the next image will fade in,
     * but it will also move in a direction
     * @param direction The direction the image will move from
     * @param offset The distance the image will move (in pixels)
     * @param duration The duration of the transition
     * @param src The source of the next image
     */
    constructor(direction: "left" | "right" | "top" | "bottom", offset: number, duration: number = 1000, src?: Scene | StaticImageData | string) {
        super();
        this.duration = duration;
        this.direction = direction;
        this.offset = offset;
        if (src) {
            this.src = typeof src === "string" ? src :
                src instanceof Scene ? Utils.backgroundToSrc(src.config.background) :
                    Utils.staticImageDataToSrc(src);
        }
        this.__stack = getCallStack();
    }

    setSrc(src: string) {
        this.src = src;
    }

    public start(onComplete?: () => void): void {
        if (!this.src) {
            throw new Error("src is required, but not provided\nat:\n" + this.__stack);
        }

        this.state.opacity = 0;
        this.state.transform = this.getInitialTransform();

        this.requestAnimation({
            start: 0,
            end: 1,
            duration: this.duration
        }, {
            onComplete,
            onUpdate: (value) => {
                this.state.opacity = value;
                this.state.transform = this.getTransform(value);
            }
        });
    }

    public toElementProps(): (FadeInProps & ElementProp)[] {
        return [
            {
                style: {
                    opacity: 1,
                }
            },
            {
                style: {
                    opacity: this.state.opacity,
                    transform: this.state.transform,
                },
                src: this.src,
            }
        ];
    }

    copy(): ITransition<FadeInProps> {
        return new FadeIn(this.direction, this.offset, this.duration, this.src);
    }

    private getInitialTransform(): string {
        switch (this.direction) {
            case "left":
                return `translateX(-${this.offset}px)`;
            case "right":
                return `translateX(${this.offset}px)`;
            case "top":
                return `translateY(-${this.offset}px)`;
            case "bottom":
                return `translateY(${this.offset}px)`;
            default:
                return "";
        }
    }

    private getTransform(progress: number): string {
        switch (this.direction) {
            case "left":
                return `translateX(${(1 - progress) * -this.offset}px)`;
            case "right":
                return `translateX(${(1 - progress) * this.offset}px)`;
            case "top":
                return `translateY(${(1 - progress) * -this.offset}px)`;
            case "bottom":
                return `translateY(${(1 - progress) * this.offset}px)`;
            default:
                return "";
        }
    }
}