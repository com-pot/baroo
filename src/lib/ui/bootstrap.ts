
export type Size = 'sm' | 'md' | 'lg'
export const sized = (base: string, size: Size) => (size && size !== "md" ? `${base} ${base}-${size}` : base);
