/**
 * Shared header state so a flow page can drive the persistent chrome's back
 * button and step label (Create/Claim are multi-step within one route).
 */
export const nav = $state<{ back: (() => void) | null; stepLabel: string }>({
	back: null,
	stepLabel: ''
});

export function setNav(back: (() => void) | null, stepLabel = ''): void {
	nav.back = back;
	nav.stepLabel = stepLabel;
}

export function clearNav(): void {
	nav.back = null;
	nav.stepLabel = '';
}
