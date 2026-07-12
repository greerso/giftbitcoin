/** The four gift-card designs from GiftBitcoin Design.dc.html. */

export interface CardDesign {
	id: string;
	name: string;
	label: string;
	/** CSS background for the card face */
	bg: string;
	/** box-shadow color */
	shadow: string;
	/** CSS applied to an absolutely-positioned overlay div (the decorative band) */
	band: string;
}

export const CARD_DESIGNS: CardDesign[] = [
	{
		id: 'classic',
		name: 'Classic',
		label: 'Bitcoin gift card',
		bg: 'linear-gradient(135deg,#D98A2B,#B8650E)',
		shadow: 'rgba(201,114,16,0.28)',
		band: 'position:absolute;inset:0;background:repeating-linear-gradient(115deg,rgba(255,255,255,0.07) 0 26px,rgba(255,255,255,0) 26px 52px)'
	},
	{
		id: 'birthday',
		name: 'Birthday',
		label: 'Happy birthday',
		bg: 'linear-gradient(135deg,#C65A45,#A8402E)',
		shadow: 'rgba(166,64,46,0.28)',
		band: 'position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,0.35) 2.5px,transparent 3px),radial-gradient(rgba(255,220,150,0.5) 2px,transparent 2.5px);background-size:58px 58px,40px 40px;background-position:8px 12px,28px 32px'
	},
	{
		id: 'midnight',
		name: 'Midnight',
		label: 'A gift for you',
		bg: 'linear-gradient(135deg,#2E3947,#1D2430)',
		shadow: 'rgba(29,36,48,0.35)',
		band: 'position:absolute;top:0;bottom:0;right:58px;width:14px;background:#C97210;opacity:0.9'
	},
	{
		id: 'holiday',
		name: 'Holiday',
		label: 'Season’s greetings',
		bg: 'linear-gradient(135deg,#3A7A5B,#27573F)',
		shadow: 'rgba(39,87,63,0.3)',
		band: 'position:absolute;width:220px;height:220px;border-radius:50%;background:rgba(255,255,255,0.09);right:-60px;top:-90px'
	}
];

export function cardDesign(id: string): CardDesign {
	return CARD_DESIGNS.find((d) => d.id === id) ?? CARD_DESIGNS[0];
}
