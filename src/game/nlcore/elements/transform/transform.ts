import type {Background, color, CommonImage, CommonImagePosition,} from "@core/types";
import {ImagePosition,} from "@core/types";
import type {AnimationPlaybackControls, DOMKeyframesDefinition, DynamicAnimationOptions} from "framer-motion";
import {deepMerge, DeepPartial, sleep, toHex} from "@lib/util/data";
import {GameState} from "@player/gameState";
import {TransformDefinitions} from "./type";
import {Align, CommonPosition, Coord2D, IPosition, PositionUtils, RawPosition} from "./position";
import {CSSProps} from "@core/elements/transition/type";
import {Utils} from "@core/common/Utils";
import {animate} from "framer-motion/dom";
import Sequence = TransformDefinitions.Sequence;
import SequenceProps = TransformDefinitions.SequenceProps;
import React from "react";
import {Image, ImageConfig} from "@core/elements/image";

export type Transformers =
    "position"
    | "opacity"
    | "scale"
    | "rotation"
    | "display"
    | "src"
    | "backgroundColor"
    | "backgroundOpacity"
    | "transform";
export type TransformHandler<T> = (value: T) => DOMKeyframesDefinition;
export type TransformersMap = {
    "position": CommonImage["position"],
    "opacity": number,
    "scale": number,
    "rotation": number,
    "display": string,
    "src": string,
    "backgroundColor": Background["background"],
    "backgroundOpacity": number,
    "transform": TransformDefinitions.Types,
}

const CommonImagePositionMap = {
    [ImagePosition.left]: "25.33%",
    [ImagePosition.center]: "50%",
    [ImagePosition.right]: "75.66%"
} as const;

export class Transform<T extends TransformDefinitions.Types = TransformDefinitions.ImageTransformProps> {
    static defaultSequenceOptions: Partial<TransformDefinitions.CommonSequenceProps> = {
        sync: true,
        repeat: 1,
    };
    static defaultOptions: TransformDefinitions.SequenceProps<any> = {
        duration: 0,
        ease: "linear",
    };
    static CommonImagePositionMap = CommonImagePositionMap;

    private readonly sequenceOptions: TransformDefinitions.CommonSequenceProps;
    private sequences: TransformDefinitions.Sequence<T>[] = [];
    private control: AnimationPlaybackControls | null = null;
    private transformers: { [K in Transformers]?: TransformHandler<any> } = {};

    /**
     * @example
     * ```ts
     * const transform = new Transform<ImageTransformProps>({
     *   opacity: 1,
     *   position: "center"
     * }, {
     *   duration: 0,
     *   ease: "linear"
     * });
     * ```
     */
    constructor(sequences: Sequence<T>[], sequenceOptions?: Partial<TransformDefinitions.TransformConfig>);
    constructor(props: SequenceProps<T>, options?: Partial<TransformDefinitions.CommonTransformProps>);
    constructor(arg0: Sequence<T>[] | SequenceProps<T>, arg1?: Partial<TransformDefinitions.TransformConfig> | Partial<TransformDefinitions.CommonTransformProps>) {
        if (Array.isArray(arg0)) {
            this.sequences.push(...arg0);
            this.sequenceOptions =
                Object.assign({}, Transform.defaultSequenceOptions, arg1 || {}) as TransformDefinitions.CommonSequenceProps;
        } else {
            const [props, options] =
                [(arg0 as SequenceProps<T>), (arg1 || Transform.defaultOptions as Partial<TransformDefinitions.CommonTransformProps>)];
            this.sequences.push({props, options: options || {}});
            this.sequenceOptions =
                Object.assign({}, Transform.defaultSequenceOptions) as TransformDefinitions.CommonSequenceProps;
        }
    }

    public static isPosition(position: any): position is (CommonImagePosition | Coord2D | Align) {
        return CommonPosition.isCommonPositionType(position) || Coord2D.isCoord2DPosition(position) || Align.isAlignPosition(position);
    }

    public static positionToCSS(
        position: IPosition,
        invertY?: boolean | undefined,
        invertX?: boolean | undefined
    ): CSSProps {
        return PositionUtils.D2PositionToCSS(position.toCSS(), invertX, invertY);
    }

    public static backgroundToCSS(background: Background["background"]): {
        backgroundImage?: string,
        backgroundColor?: string
    } {
        if (background === null || background === undefined) return {};
        if (Utils.isStaticImageData(background)) {
            return {backgroundImage: `url(${background.src})`};
        }
        if (typeof background === "string") {
            return {backgroundColor: background};
        }
        if (["r", "g", "b"].every(key => key in background)) {
            return {backgroundColor: toHex(background as color)};
        }
        const url = (background as { url: string }).url;
        return {backgroundImage: "url(" + url + ")"};
    }

    static mergePosition(a: RawPosition | undefined, b: RawPosition | undefined): Coord2D {
        if (!a && !b) {
            throw new Error("No position found.");
        }
        if (!a || !b) {
            return PositionUtils.toCoord2D(PositionUtils.tryParsePosition(a || b)!);
        }
        return PositionUtils.mergePosition(
            PositionUtils.tryParsePosition(a),
            PositionUtils.tryParsePosition(b)
        );
    }

    static mergeState<T>(state: any, props: any): DeepPartial<T> {
        const position = this.mergePosition(state["position"], props["position"]);
        return {
            ...deepMerge(state, props),
            position,
        };
    }

    /**
     * @example
     * ```ts
     * const [scope, animate] = useAnimation();
     * transform.animate(scope, animate);
     * return <div ref={scope} />
     * ```
     */
    public async animate(
        {scope, overwrites, image}:
            {
                scope: React.MutableRefObject<HTMLDivElement | null>,
                overwrites?: Partial<{ [K in Transformers]?: TransformHandler<any> }>,
                image: Image,
            },
        gameState: GameState,
        initState?: SequenceProps<T>,
        after?: (state: DeepPartial<T>) => void
    ) {

        return new Promise<void>((resolve) => {
            (async () => {
                if (!this.sequenceOptions.sync) {
                    resolve();
                    if (after) {
                        after(image.state as any);
                    }
                }
                for (let i = 0; i < this.sequenceOptions.repeat; i++) {
                    for (const {props, options} of this.sequences) {
                        const initState = deepMerge({}, this.propToCSS(gameState, image.state as any));

                        if (!scope.current) {
                            throw new Error("No scope found when animating.");
                        }
                        const current = scope.current as any;
                        Object.assign(current["style"], initState);

                        image.state = Transform.mergeState(image.state, props) as ImageConfig;

                        const animation = animate(
                            current,
                            this.propToCSS(gameState, image.state as any, overwrites),
                            this.optionsToFramerMotionOptions(options) || {}
                        );
                        this.setControl(animation);

                        gameState.logger.debug("Animating", this.propToCSS(gameState, image.state as any, overwrites));

                        if (options?.sync === false) {
                            animation.then(() => {
                                Object.assign(current["style"], this.propToCSS(gameState, image.state as any, overwrites));
                                this.setControl(null);
                            });
                        } else {
                            await new Promise<void>(r => animation.then(() => r()));
                            Object.assign(current["style"], this.propToCSS(gameState, image.state as any, overwrites));
                            this.setControl(null);
                        }
                    }
                }

                await sleep(2);
                this.setControl(null);

                if (this.sequenceOptions.sync) {
                    resolve();
                    if (after) {
                        after(image.state as any);
                    }
                }
            })();
        });
    }

    /**
     * @example
     * ```ts
     * transform
     *   .repeat(2)
     *   .repeat(3)
     * // repeat 6 times
     * ```
     */
    public repeat(n: number) {
        this.sequenceOptions.repeat *= n;
        return this;
    }

    /**
     * overwrite a transformer
     *
     * **we don't recommend using this method**
     * @example
     * ```ts
     * transform.overwrite("position", (value) => {
     *   return {left: value.x, top: value.y};
     * });
     * ```
     */
    public overwrite<T extends keyof TransformersMap = any>(key: T, transformer: TransformHandler<TransformersMap[T]>) {
        this.transformers[key] = transformer;
        return this;
    }

    propToCSS(state: GameState, prop: DeepPartial<T>, overwrites?: Partial<{ [K in Transformers]?: TransformHandler<any> }>): DOMKeyframesDefinition {
        const {invertY, invertX} = state.getLastScene()?.config || {};
        const FieldHandlers: Record<string, (v: any) => any> = {
            "position": (value: IPosition) => Transform.positionToCSS(value, invertY, invertX),
            "backgroundColor": (value: Background["background"]) => Transform.backgroundToCSS(value),
            "backgroundOpacity": (value: number) => ({opacity: value}),
            "opacity": (value: number) => ({opacity: value}),
            "scale": () => {
                if (!("scale" in prop)) return {};
                return {
                    width: `${(prop as any)["scale"] * 100}%`,
                };
            },
            "rotation": () => ({}),
            "display": () => ({}),
            "src": () => ({}),
        };

        const props = {} as DOMKeyframesDefinition;
        props.transform = this.propToCSSTransform(state, prop);
        if (this.transformers["transform"]) {
            Object.assign(props, this.transformers["transform"](prop));
        }
        if (overwrites && overwrites["transform"]) {
            Object.assign(props, overwrites["transform"](prop));
        }

        for (const key in prop) {
            if (!Object.prototype.hasOwnProperty.call(prop, key)) continue;
            if (overwrites && overwrites[key as keyof TransformersMap]) {
                Object.assign(props, overwrites[key as keyof TransformersMap]!(prop[key]));
            } else if (this.transformers[key as keyof TransformersMap]) {
                Object.assign(props, this.transformers[key as keyof TransformersMap]!(prop[key]));
            } else if (FieldHandlers[key]) {
                Object.assign(props, FieldHandlers[key](prop[key]));
            }
        }
        return props;
    }

    optionsToFramerMotionOptions(options?: Partial<TransformDefinitions.CommonTransformProps>): DynamicAnimationOptions | void {
        if (!options) {
            return options;
        }
        const {duration, ease} = options;
        return {
            duration: duration ? (duration / 1000) : 0,
            ease,
        } satisfies DynamicAnimationOptions;
    }

    propToCSSTransform(state: GameState, prop: Record<string, any>): string {
        if (!state.getLastScene()) {
            throw new Error("No scene found in state, make sure you called \"scene.activate()\" before this method.");
        }
        const {invertY, invertX} = state.getLastScene()?.config || {};
        const Transforms = [
            `translate(${invertX ? "" : "-"}50%, ${invertY ? "" : "-"}50%)`,
            (prop["rotation"] !== undefined) && `rotate(${prop["rotation"]}deg)`,
        ];
        return Transforms.filter(Boolean).join(" ");
    }

    setControl(control: AnimationPlaybackControls | null) {
        this.control = control;
        return this;
    }

    getControl() {
        return this.control;
    }

    public copy(): Transform<T> {
        return new Transform<T>(this.sequences, this.sequenceOptions);
    }
}




