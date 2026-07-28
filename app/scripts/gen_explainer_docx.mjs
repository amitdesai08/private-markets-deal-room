// One-off generator: a plain-English explainer of The Deal Room as a Word document.
// Run from the app dir so `docx` resolves from app/node_modules.
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle } from 'docx';
import { writeFileSync } from 'node:fs';

const ACCENT = '2E74B5';
const MUTED = '555555';

const H1 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 260, after: 120 }, children: [new TextRun({ text, color: ACCENT, bold: true })] });
const H2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 80 }, children: [new TextRun({ text, bold: true })] });
const P = (text, opts = {}) => new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text, ...opts })] });
const runs = (children, opts = {}) => new Paragraph({ spacing: { after: 120, ...opts.spacing }, alignment: opts.alignment, children });
const B = (text) => new TextRun({ text, bold: true });
const T = (text) => new TextRun({ text });
const Bullet = (text, level = 0) => new Paragraph({ bullet: { level }, spacing: { after: 60 }, children: Array.isArray(text) ? text : [new TextRun({ text })] });
const BulletLead = (lead, rest) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 60 }, children: [new TextRun({ text: lead + ' ', bold: true }), new TextRun({ text: rest })] });

// Glossary table (2 columns).
function glossaryTable(rows) {
  const cell = (text, bold = false) => new TableCell({
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
    width: { size: bold ? 26 : 74, type: WidthType.PERCENTAGE },
    children: [new Paragraph({ children: [new TextRun({ text, bold, color: bold ? ACCENT : undefined })] })],
  });
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'DDDDDD' };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: [
      new TableRow({ tableHeader: true, children: [
        new TableCell({ shading: { fill: 'F0F4F8' }, margins: { top: 60, bottom: 60, left: 120, right: 120 }, width: { size: 26, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: 'Term / word', bold: true })] })] }),
        new TableCell({ shading: { fill: 'F0F4F8' }, margins: { top: 60, bottom: 60, left: 120, right: 120 }, width: { size: 74, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: 'What it means in plain English', bold: true })] })] }),
      ] }),
      ...rows.map(([term, def]) => new TableRow({ children: [cell(term, true), cell(def)] })),
    ],
  });
}

const children = [];

// --- Title ---
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: 'The Deal Room', bold: true, size: 52, color: ACCENT })] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: 'What we built \u2014 explained for someone brand-new to this world', size: 26, color: MUTED })] }));
children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: 'No prior knowledge assumed \u00b7 every bit of jargon explained', italics: true, size: 20, color: MUTED })] }));

// --- 1. Start here ---
children.push(H1('1. Start here: what is a "private equity firm"?'));
children.push(P('Imagine a company that does this for a living:'));
children.push(BulletLead('Raises a big pot of money', 'from large investors \u2014 pension funds, universities, wealthy families \u2014 who are looking for a strong return on their money.'));
children.push(BulletLead('Uses that money to buy whole companies', ' (or big stakes in them) \u2014 often private companies you can\u2019t buy shares of on the stock market.'));
children.push(BulletLead('Improves those companies', ' over a few years \u2014 growing sales, cutting waste, upgrading the business.'));
children.push(BulletLead('Sells them again', ' for more than it paid \u2014 and returns the profit to those original investors, keeping a share.'));
children.push(P('That kind of firm is called a private equity firm (often shortened to \u201cPE\u201d). Buying, improving, and selling a company is called a deal. A PE firm may be working on dozens of possible deals at once, and only a few will ever happen.', { }));
children.push(P('The people at the firm are a small, senior, very busy team. Their scarcest resource is their own time and attention. Every hour spent on a company that won\u2019t work out is an hour not spent on one that will.'));

// --- 2. The problem ---
children.push(H1('2. The problem we set out to solve'));
children.push(P('Today, a deal team\u2019s work is scattered everywhere: spreadsheets on laptops, documents in email, files in shared drives, numbers in different systems, and a lot of knowledge that only lives in people\u2019s heads. When a partner asks \u201cwhere does this deal stand, and can we trust these numbers?\u201d, someone has to go dig through all of it.'));
children.push(P('That scattering causes real pain:'));
children.push(Bullet('Slow answers \u2014 nobody has the full picture in one place.'));
children.push(Bullet('Inconsistent numbers \u2014 two people quote two different figures for the same company.'));
children.push(Bullet('Wasted effort \u2014 the team goes deep on companies they should have ruled out early.'));
children.push(Bullet('Risk \u2014 sensitive information ends up in the wrong hands, which for this industry can be a legal problem.'));

// --- 3. What we built ---
children.push(H1('3. What we built, in one paragraph'));
children.push(runs([
  T('We built '), B('The Deal Room'), T(' \u2014 a single, shared workspace where a deal team runs the entire life of a deal, from the first spark of interest all the way through to owning and eventually selling the company. It lives '),
  B('inside Microsoft Teams'), T(' (the chat-and-collaboration app many companies already use every day), so there\u2019s no new website to learn. You can also '),
  B('ask it questions in plain language'), T(' \u2014 like messaging a very well-informed colleague \u2014 and it answers using the deal\u2019s real, up-to-date information. And it makes sure '),
  B('each person only sees what they\u2019re allowed to see.'),
]));

// --- 4. The journey ---
children.push(H1('4. How a deal travels through it (the journey)'));
children.push(P('A deal moves through a series of stages, like a pipeline. The Deal Room guides the team through each one and does a lot of the heavy lifting along the way.'));

children.push(H2('Stage 1 \u2014 Sourcing: \u201cwhich companies are even worth a look?\u201d'));
children.push(P('The firm is constantly picking up signals about companies \u2014 news, a conversation, a filing. The Deal Room helps sift these and flags the handful worth pursuing, so the team spends time on the right ones instead of chasing everything.'));

children.push(H2('Stage 2 \u2014 Screening: \u201cdoes this fit what we\u2019re looking for?\u201d'));
children.push(P('Each promising company is quickly checked against the firm\u2019s rules and preferences (the kind of business, the size, the risk). The goal is to say a fast \u201cno\u201d to poor fits and a confident \u201clet\u2019s dig deeper\u201d to good ones.'));

children.push(H2('Stage 3 \u2014 Diligence: \u201cdo the homework.\u201d'));
children.push(runs([
  T('If a company passes, the team investigates it thoroughly \u2014 the finances, the market, the technology, the operations, the legal side. This deep investigation is called '),
  B('due diligence'), T(' (or just \u201cdiligence\u201d). Different specialists dig into different areas at the same time. The Deal Room keeps every finding in one place, colour-coded by how it\u2019s going (green = fine, amber = watch, red = problem), so everyone can see the true state at a glance.'),
]));

children.push(H2('Stage 4 \u2014 The decision: \u201cshould we actually buy it?\u201d'));
children.push(runs([
  T('The firm has a group of senior people who make the final yes/no call \u2014 the '),
  B('Investment Committee'), T(' (\u201cIC\u201d). Before that meeting, the team prepares the key documents: a projection of how much money the deal could make, the plan to improve the company, and the main risks. The Deal Room drafts these from the deal\u2019s real numbers and gives a clear verdict \u2014 '),
  B('Ready, Conditional, or Not-Ready'), T(' \u2014 plus the top things still blocking approval.'),
]));

children.push(H2('Stage 5 \u2014 Owning it: \u201cnow make it better.\u201d'));
children.push(P('Once the firm buys the company, the job shifts to improving it \u2014 following a plan (often called the \u201c100-day plan\u201d for the first stretch), tracking how the business is actually performing versus what was promised, and reporting back to the investors. The Deal Room keeps monitoring the company and flags any that are falling behind, honestly \u2014 it surfaces problems rather than hiding them.'));

children.push(H2('Stage 6 \u2014 Exit: \u201csell it well.\u201d'));
children.push(P('Eventually the firm sells the company \u2014 called the exit \u2014 aiming for the best price and timing so the original investors get a strong return. The Deal Room helps assess when and how to sell and prepares the materials for it.'));

// --- 5. What it actually does for the team ---
children.push(H1('5. The helpful things it does for the team'));
children.push(BulletLead('Answers questions in plain language.', 'Anyone can ask \u201cwhat\u2019s the case for this deal?\u201d or \u201cwhat\u2019s holding it up?\u201d and get a clear answer built from the deal\u2019s real information \u2014 with the sources shown, so it can be trusted.'));
children.push(BulletLead('Gives every deal its own private home.', 'The moment a deal is live, it automatically gets its own chat space and a secure folder for its documents \u2014 no setup, no IT ticket.'));
children.push(BulletLead('Writes the first draft of key documents.', 'The memos, financial models and slide decks a deal needs are drafted automatically from the live numbers, so people start from something rather than a blank page.'));
children.push(BulletLead('Suggests the next step \u2014 but never acts on its own.', 'It can propose an action (\u201clog this as an issue,\u201d \u201cmark this resolved\u201d), and a person clicks to approve. Every approved change is recorded with who did it and when \u2014 a clean trail.'));
children.push(BulletLead('Keeps one honest set of numbers.', 'Everyone \u2014 the chat, the dashboards, and the reports \u2014 reads from the same live record, so there\u2019s never a \u201cwhich version is right?\u201d argument.'));
children.push(BulletLead('Works on real public data out of the box.', 'It can pull genuine, public company and market information for free, so it\u2019s useful immediately without buying expensive data subscriptions first.'));

// --- 6. Who uses it ---
children.push(H1('6. Who uses it'));
children.push(P('Different people at the firm have different jobs and see different things:'));
children.push(BulletLead('Analyst \u2014', 'the most junior researcher; does the digging and modelling, usually can only see the deals they\u2019re assigned to.'));
children.push(BulletLead('Sector specialists \u2014', 'experts in a particular industry or area (for example, technology, or operations) who investigate their piece of a deal.'));
children.push(BulletLead('Partner \u2014', 'a senior leader who sponsors a deal and helps make the final call.'));
children.push(BulletLead('Finance and legal leads \u2014', 'who handle the money structure and the contracts.'));
children.push(BulletLead('Investor relations \u2014', 'the person who reports results back to the outside investors.'));
children.push(P('The Deal Room even provides an AI \u201cspecialist\u201d for each of these jobs, so asking a question feels like consulting the right expert \u2014 without needing that busy human free at that moment.'));

// --- 7. Safety & privacy ---
children.push(H1('7. How it keeps sensitive information safe'));
children.push(P('This industry is legally required to control who sees what. Knowing confidential information about a company and misusing it is a serious offence, so \u201cneed-to-know\u201d isn\u2019t a nicety \u2014 it\u2019s the law.'));
children.push(BulletLead('You only see what your role allows.', 'A junior analyst can\u2019t see a confidential deal a senior partner is quietly working on. This is decided by the system itself, not something a user can trick or turn off.'));
children.push(BulletLead('Confidential deals can be hidden entirely.', 'The most sensitive deals simply don\u2019t appear for people who aren\u2019t on them \u2014 they can\u2019t even tell the deal exists.'));
children.push(BulletLead('Access can follow region and team.', 'Someone covering one part of the country sees their deals; a special \u201cclean team\u201d on a sensitive transaction sees only theirs.'));
children.push(BulletLead('The outside-facing tools are walled off from the private ones.', 'The part that reads public news can never reach into the firm\u2019s confidential documents \u2014 that wall is enforced and logged, so nothing leaks across it.'));

// --- 8. Where it lives ---
children.push(H1('8. Where it lives, and why that\u2019s good'));
children.push(BulletLead('Inside Microsoft Teams.', 'The team already works there all day, so there\u2019s nothing new to adopt \u2014 it meets them where they are.'));
children.push(BulletLead('In the firm\u2019s own secure cloud.', 'Everything runs inside the firm\u2019s own Microsoft cloud account, so the firm keeps full control of its data \u2014 it never leaves their walls.'));
children.push(BulletLead('Easy to switch on, cheap to try.', 'It can be set up with a single command, and it \u201cgoes to sleep\u201d when nobody\u2019s using it so a trial costs almost nothing.'));
children.push(BulletLead('Uses the same connected tools that Microsoft 365 provides.', 'It can also plug into the team\u2019s existing files, chats and email (with permission) so its answers reflect the firm\u2019s actual working knowledge.'));

// --- 9. The one-sentence version ---
children.push(H1('9. The whole thing in one sentence'));
children.push(runs([
  new TextRun({ text: 'The Deal Room takes a company deal from the very first spark of interest all the way to a business the firm owns and monitors \u2014 in one shared, plain-language workspace inside the tools the team already uses, with every answer built from real information and every person seeing only what they\u2019re allowed to.', italics: true, size: 24 }),
]));

// --- 10. Glossary ---
children.push(H1('10. Jargon decoder (every acronym, in plain words)'));
children.push(P('You don\u2019t need any of these to use the product \u2014 but here\u2019s what the words mean when you hear them.'));
children.push(glossaryTable([
  ['Private equity (PE)', 'A firm that raises money from big investors, buys companies, improves them, and sells them for a profit.'],
  ['Deal', 'A single effort to buy (and later sell) a company.'],
  ['Pipeline', 'All the possible deals the firm is looking at, at various stages \u2014 like a sales funnel.'],
  ['Sourcing', 'Finding companies that might be worth buying.'],
  ['Screening', 'Quickly checking whether a company fits what the firm wants, to rule out poor fits early.'],
  ['Due diligence (\u201cdiligence\u201d)', 'The deep investigation of a company before buying \u2014 finances, market, legal, technology, operations.'],
  ['Investment Committee (IC)', 'The group of senior people who give the final yes/no on doing a deal.'],
  ['Data room', 'A secure, organised folder of all a deal\u2019s confidential documents.'],
  ['Memo / IC memo', 'The written case for a deal that the committee reads before deciding.'],
  ['Model', 'A spreadsheet that projects how much money a deal could make under different assumptions.'],
  ['Returns (IRR / MOIC)', 'Measures of how profitable a deal is. MOIC = how many times you multiplied your money (e.g. 2x). IRR = that profit expressed as a yearly percentage rate.'],
  ['Hurdle', 'The minimum return a deal must beat to be worth doing.'],
  ['LP (Limited Partner)', 'The outside investors who give the firm its money (pensions, universities, families).'],
  ['Fund', 'The pot of money, raised from those investors, that the firm invests.'],
  ['Portfolio company', 'A company the firm has bought and now owns.'],
  ['100-day plan', 'The improvement plan for the first stretch after buying a company.'],
  ['Exit', 'Selling a company the firm owns, to realise the profit.'],
  ['Need-to-know / information barrier', 'The rule (and the law) that people should only see the confidential information their role requires.'],
  ['MNPI', 'Material Non-Public Information \u2014 sensitive, price-moving information about a company that isn\u2019t public; misusing it is illegal, so access is tightly controlled.'],
  ['NDA', 'Non-Disclosure Agreement \u2014 a contract promising to keep shared information confidential.'],
  ['Microsoft Teams', 'The everyday chat-and-collaboration app the product lives inside.'],
  ['AI assistant / specialist', 'The built-in helper you ask questions in plain language; it can act like a specific expert (analyst, finance lead, etc.).'],
]));

children.push(new Paragraph({ spacing: { before: 240 }, children: [new TextRun({ text: 'Prepared as a plain-English reference. Nothing here requires prior knowledge of private equity.', italics: true, color: MUTED, size: 18 })] }));

const doc = new Document({
  creator: 'The Deal Room',
  title: 'The Deal Room \u2014 Explained in Plain English',
  styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
  sections: [{ properties: { page: { margin: { top: 1000, bottom: 1000, left: 1100, right: 1100 } } }, children }],
});

const out = process.argv[2] || 'The-Deal-Room-Explained.docx';
const buf = await Packer.toBuffer(doc);
writeFileSync(out, buf);
console.log('Wrote ' + out + ' (' + buf.length + ' bytes)');
