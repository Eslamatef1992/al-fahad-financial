const {
	amountInWordsAr,
	amountInWordsEn,
} = require("../services/numberToWords");

const cases = [
	{ amount: 100.0, ar: "مائة دينار كويتي فقط لا غير" },
	{ amount: 1.0, ar: "دينار كويتي واحد فقط لا غير" },
	{ amount: 2.0, ar: "ديناران كويتيان فقط لا غير" },
	{ amount: 5.0, ar: "خمسة دنانير كويتية فقط لا غير" },
	{ amount: 25.0, ar: "خمسة وعشرون دينارا كويتيا فقط لا غير" },
	{ amount: 250.5, ar: "مائتان وخمسون دينارا كويتيا وخمسمائة فلس فقط لا غير" },
	{
		amount: 1350.75,
		ar: "ألف وثلاثمائة وخمسون دينارا كويتيا وسبعمائة وخمسون فلسا فقط لا غير",
	},
	{ amount: 0.5, ar: "خمسمائة فلس فقط لا غير" },
];

let failed = 0;
for (const { amount, ar } of cases) {
	const got = amountInWordsAr(amount, "KWD");
	if (got !== ar) {
		failed++;
	}
}

// Sanity checks on the English side too (sub-1-unit amount must not say "Zero ... and").
const enZeroWhole = amountInWordsEn(0.5, "KWD");
if (enZeroWhole !== "Five Hundred Fils Only") {
	failed++;
}

if (failed) {
	process.exit(1);
}
