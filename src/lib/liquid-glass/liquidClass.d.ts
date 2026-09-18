export interface LiquidClassShadowLayer {
  x: number;
  y: number;
  blur: number;
  opacity: number;
}

export interface LiquidClassOptions {
  backgroundColor?: string;
  borderRadius?: string;
  blur?: string;
  brightness?: number;
  displacementScale?: number;
  draggable?: boolean;
  displacementType?: 'image' | 'turbulence' | 'noise';
  displacementImage?: string;
  turbulenceFrequency?: number;
  turbulenceOctaves?: number;
  dropShadowOpacity?: number;
  dropShadowX?: number;
  dropShadowY?: number;
  shadowStrength?: number;
  shadowLayers?: LiquidClassShadowLayer[];
}

export declare class LiquidClass {
  constructor(element: HTMLElement, options?: LiquidClassOptions);
  updateOptions(options: LiquidClassOptions): void;
  setDisplacementScale(scale: number): void;
  setBackgroundColor(color: string, opacity?: number): void;
  setDisplacementType(type: 'image' | 'turbulence' | 'noise', options?: LiquidClassOptions): void;
  setTurbulenceParameters(frequency: number, octaves: number): void;
  setDropShadowParameters(x: number, y: number, opacity: number, strength?: number): void;
  setShadowStrength(strength: number): void;
}
