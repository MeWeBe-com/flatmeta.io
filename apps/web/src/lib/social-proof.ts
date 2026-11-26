/**
 * 0008: live counters are shown only once they help. A visitor who reads "1 explorers" or "1 plot made by people"
 * concludes nobody is here and leaves. Below these floors the number is left out (never rounded up or invented);
 * the totals that are already large (plots incl. showcase, countries) stay.
 */
export const MIN_EXPLORERS_SHOWN = 50;
export const MIN_PEOPLE_PLOTS_SHOWN = 25;
