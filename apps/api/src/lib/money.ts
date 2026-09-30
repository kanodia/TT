// Money is stored in paise (spec 9) and exchanged with clients as whole rupees.
export const toPaise = (rupees: number) => Math.round(rupees * 100);
export const toRupees = (paise: number) => Math.round(paise / 100);
