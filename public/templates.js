// Tunisian school exam templates. Shared by the browser and the server (UMD).
//
// The blueprints below come from reading 524 real papers (collège to Bac, 704 PDFs from devoir.tn, many with
// text that could be read): the duration, number of exercises, how the 20 marks are split, how the parts are
// titled and which language each subject is written in all differ by class and subject.
// Real school papers carry the school name, teacher, class, date and duration. The Republic / Ministry block
// appears only on national papers (3% of the sample), so it is optional here and off by default.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TPL = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  // ---------- Classes ----------
  var LEVELS = [
    { group: { fr: 'Primaire', ar: 'الابتدائي', en: 'Primary' }, items: [
      { id: 'p4', cycle: 'primary', fr: '4ème année primaire', ar: 'السنة الرابعة ابتدائي', en: 'Primary 4' },
      { id: 'p5', cycle: 'primary', fr: '5ème année primaire', ar: 'السنة الخامسة ابتدائي', en: 'Primary 5' },
      { id: 'p6', cycle: 'primary', fr: '6ème année primaire', ar: 'السنة السادسة ابتدائي', en: 'Primary 6' },
    ] },
    { group: { fr: 'Collège (enseignement de base)', ar: 'الإعدادي', en: 'Collège (basic education)' }, items: [
      { id: 'b7', cycle: 'base', fr: '7ème année de base', ar: 'السنة السابعة أساسي', en: '7th year (basic)' },
      { id: 'b8', cycle: 'base', fr: '8ème année de base', ar: 'السنة الثامنة أساسي', en: '8th year (basic)' },
      { id: 'b9', cycle: 'base', fr: '9ème année de base', ar: 'السنة التاسعة أساسي', en: '9th year (basic)' },
    ] },
    { group: { fr: 'Lycée', ar: 'الثانوي', en: 'Lycée (secondary)' }, items: [
      { id: 's1', cycle: 'sec', fr: '1ère année secondaire', ar: 'السنة الأولى ثانوي', en: '1st year secondary' },
      { id: 's2l', cycle: 'sec', fr: '2ème Lettres', ar: 'الثانية آداب', en: '2nd Arts' },
      { id: 's2s', cycle: 'sec', fr: '2ème Sciences', ar: 'الثانية علوم', en: '2nd Sciences' },
      { id: 's2e', cycle: 'sec', fr: '2ème Économie et Gestion', ar: 'الثانية اقتصاد وتصرف', en: '2nd Economics' },
      { id: 's2t', cycle: 'sec', fr: '2ème Technologie de l\'informatique', ar: 'الثانية تكنولوجيا الإعلامية', en: '2nd IT' },
      { id: 's3l', cycle: 'sec', fr: '3ème Lettres', ar: 'الثالثة آداب', en: '3rd Arts' },
      { id: 's3m', cycle: 'sec', fr: '3ème Mathématiques', ar: 'الثالثة رياضيات', en: '3rd Maths' },
      { id: 's3s', cycle: 'sec', fr: '3ème Sciences expérimentales', ar: 'الثالثة علوم تجريبية', en: '3rd Experimental sciences' },
      { id: 's3e', cycle: 'sec', fr: '3ème Économie et Gestion', ar: 'الثالثة اقتصاد وتصرف', en: '3rd Economics' },
      { id: 's3t', cycle: 'sec', fr: '3ème Sciences techniques', ar: 'الثالثة علوم تقنية', en: '3rd Technical sciences' },
      { id: 's3i', cycle: 'sec', fr: '3ème Sciences de l\'informatique', ar: 'الثالثة علوم الإعلامية', en: '3rd Computer science' },
      { id: 's4l', cycle: 'sec', fr: '4ème Lettres (Bac)', ar: 'الرابعة آداب (باك)', en: '4th Arts (Bac)' },
      { id: 's4m', cycle: 'sec', fr: '4ème Mathématiques (Bac)', ar: 'الرابعة رياضيات (باك)', en: '4th Maths (Bac)' },
      { id: 's4s', cycle: 'sec', fr: '4ème Sciences expérimentales (Bac)', ar: 'الرابعة علوم تجريبية (باك)', en: '4th Experimental sciences (Bac)' },
      { id: 's4e', cycle: 'sec', fr: '4ème Économie et Gestion (Bac)', ar: 'الرابعة اقتصاد وتصرف (باك)', en: '4th Economics (Bac)' },
      { id: 's4t', cycle: 'sec', fr: '4ème Sciences techniques (Bac)', ar: 'الرابعة علوم تقنية (باك)', en: '4th Technical sciences (Bac)' },
      { id: 's4i', cycle: 'sec', fr: '4ème Sciences de l\'informatique (Bac)', ar: 'الرابعة علوم الإعلامية (باك)', en: '4th Computer science (Bac)' },
    ] },
  ];

  // The class group used to pick a blueprint: primary, base (7-9), s1, s2, s3 or bac.
  function cycleKey(levelId) {
    var lv = findLevel(levelId);
    if (lv.cycle === 'primary') return 'primary';
    if (lv.cycle === 'base') return 'base';
    var y = levelId.charAt(1);
    return y === '4' ? 'bac' : 's' + y;
  }

  // ---------- Paper kinds and exam languages ----------
  var KINDS = {
    control: { fr: 'Devoir de contrôle', ar: 'فرض مراقبة', en: 'Control test', it: 'Compito in classe', de: 'Klassenarbeit', es: 'Examen de control', nums: [1, 2, 3] },
    synthese: { fr: 'Devoir de synthèse', ar: 'فرض تأليفي', en: 'Synthesis test', it: 'Compito di sintesi', de: 'Synthesearbeit', es: 'Examen de síntesis', nums: [1, 2, 3] },
    eval: { fr: 'Évaluation', ar: 'تقييم', en: 'Assessment', it: 'Valutazione', de: 'Bewertung', es: 'Evaluación', nums: [0] },
    bacblanc: { fr: 'Bac blanc', ar: 'باكالوريا تجريبي', en: 'Mock Bac', it: 'Bac di prova', de: 'Probe-Abitur', es: 'Bac simulado', nums: [0] },
  };
  var LANGS = { fr: 'Français', ar: 'العربية', en: 'English', it: 'Italiano', de: 'Deutsch', es: 'Español' };

  // ---------- Titles of the exercises ----------
  var ORD_AR = ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس', 'السابع', 'الثامن'];
  var ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];
  var AR_LETTER = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];

  // Exercise 1..n, with the last one called "Problème" when the paper ends with a problem.
  function exo(n, problem) {
    var fr = [], ar = [], en = [];
    for (var i = 1; i <= n; i++) {
      var last = problem && i === n;
      fr.push(last ? 'Problème' : 'Exercice ' + i);
      ar.push(last ? 'المسألة' : 'التمرين ' + ORD_AR[i - 1]);
      en.push(last ? 'Problem' : 'Exercise ' + i);
    }
    return { fr: fr, ar: ar, en: en };
  }
  // Numbered parts: "I- Compréhension", "II- Langue" ...
  function parts(fr, ar, en) {
    return {
      fr: fr.map(function (t, i) { return ROMAN[i] + '- ' + t; }),
      ar: (ar || fr).map(function (t, i) { return AR_LETTER[i] + '- ' + t; }),
      en: (en || fr).map(function (t, i) { return ROMAN[i] + '- ' + t; }),
    };
  }
  function exoParts(prefixFr, prefixAr, prefixEn, labels) { // "Exercice 1 : Chimie"
    var out = { fr: [], ar: [], en: [] };
    labels.forEach(function (l, i) {
      out.fr.push('Exercice ' + (i + 1) + ' : ' + l[0]);
      out.ar.push('التمرين ' + ORD_AR[i] + ' : ' + l[1]);
      out.en.push('Exercise ' + (i + 1) + ': ' + l[2]);
    });
    return out;
  }
  var C = function (mcq, tf, short, essay) { return { mcq: mcq, tf: tf, short: short, essay: essay }; };

  // ---------- Subjects ----------
  // lang: usual language of the paper. math: write formulas as LaTeX. support: text-based (the lesson is printed).
  // names: per-cycle display names where the real name changes (islamic education becomes islamic thought).
  var SUBJECTS = [
    { id: 'maths', fr: 'Mathématiques', ar: 'الرياضيات', en: 'Mathematics', lang: 'fr', math: true, support: false,
      hint: 'Tunisian maths paper. Short exercises with numbered sub-questions (1) 2) 3) …) that build on each other; the last exercise is the longest. Quick checks (QCM or true/false with justification) only when the blueprint has them. Use realistic numbers. Describe any figure in words so the teacher can draw it.' },
    { id: 'physique', fr: 'Sciences physiques', ar: 'العلوم الفيزيائية', en: 'Physical sciences', lang: 'fr', math: true, support: false,
      hint: 'Tunisian physics-chemistry paper. Each exercise gives data (numerical values with SI units, g = 10 N/kg unless the lesson says otherwise) and numbered questions: name, explain, calculate, conclude. Ask for the formula before the numerical answer.' },
    { id: 'svt', fr: 'Sciences de la vie et de la Terre', ar: 'علوم الحياة والأرض', en: 'Life and Earth sciences', lang: 'fr', support: false,
      hint: 'Tunisian SVT paper. Knowledge restitution (definitions, QCM, true/false with correction of the false statements) then exploitation of a document or experiment described in words: observe, interpret, conclude.' },
    { id: 'francais', fr: 'Français', ar: 'الفرنسية', en: 'French', lang: 'fr', support: true,
      hint: 'Tunisian French paper built on the support text (the lesson text). Comprehension questions on the text (full sentences, justify with a quotation), then language (grammar, conjugation, spelling, vocabulary exercises taken from the text), then a written production topic linked to the theme with clear instructions (genre, length, constraints).' },
    { id: 'arabe', fr: 'Arabe', ar: 'اللغة العربية', en: 'Arabic', lang: 'ar', support: true,
      hint: 'Tunisian Arabic-language paper built on the support text (النص): comprehension (الفهم), language (النحو والصرف والتحويل والإعراب), then written production (الإنتاج الكتابي) with a clear subject and guidelines. Correct Modern Standard Arabic.' },
    { id: 'anglais', fr: 'Anglais', ar: 'الإنجليزية', en: 'English', lang: 'en', support: true,
      hint: 'Tunisian English paper built on the support text: reading comprehension (true/false with justification, multiple choice, wh-questions), language (grammar, vocabulary, phonetics, functions), then a guided writing task. All in English.' },
    { id: 'histoire', fr: 'Histoire', ar: 'التاريخ', en: 'History', lang: 'ar', support: false,
      hint: 'Tunisian history paper. Parts with their marks: definitions and dates, then questions that exploit a short document described in words, then one developed answer (introduction, development, conclusion).' },
    { id: 'geo', fr: 'Géographie', ar: 'الجغرافيا', en: 'Geography', lang: 'ar', support: false,
      hint: 'Tunisian geography paper. Parts with their marks: knowledge questions, a map or table described in words to read and comment, then a developed answer.' },
    { id: 'histgeo', fr: 'Histoire-Géographie', ar: 'التاريخ والجغرافيا', en: 'History-Geography', lang: 'fr', support: false,
      hint: 'Tunisian history-geography paper: a history part and a geography part, each with definitions, a document to exploit and one developed answer.' },
    { id: 'civique', fr: 'Éducation civique', ar: 'التربية المدنية', en: 'Civic education', lang: 'ar', support: false,
      hint: 'Short Tunisian civic education paper: definitions, true/false with justification, and one short applied situation.' },
    { id: 'islam', fr: 'Éducation islamique', ar: 'التربية الإسلامية', en: 'Islamic education', lang: 'ar', support: false,
      names: { sec: { fr: 'Pensée islamique', ar: 'الفكر الإسلامي', en: 'Islamic thought' } },
      hint: 'Tunisian Islamic education paper: knowledge questions, verses and hadith to complete or explain, and one applied situation (وضعية).' },
    { id: 'philo', fr: 'Philosophie', ar: 'الفلسفة', en: 'Philosophy', lang: 'ar', support: true,
      hint: 'Tunisian philosophy paper built on a support text: short questions on the text (concept, argument, position), then a reasoned essay on a problem with the exact wording of the subject.' },
    { id: 'info', fr: 'Informatique', ar: 'الإعلامية', en: 'Computer science', lang: 'fr', support: false,
      hint: 'Tunisian computer science paper: a theory part (QCM, true/false, definitions) and a practical part (an algorithm or program to read, complete or write, in the language and notation of the lesson).' },
    { id: 'algo', fr: 'Algorithmique et programmation', ar: 'الخوارزميات والبرمجة', en: 'Algorithms and programming', lang: 'fr', support: false,
      hint: 'Tunisian algorithmics paper: exercises on procedures, arrays, strings or files (analysis, algorithm in the lesson notation, then trace/complete), ending with a longer problem with a full analysis and algorithm.' },
    { id: 'bdd', fr: 'Bases de données', ar: 'قواعد البيانات', en: 'Databases', lang: 'fr', support: false,
      hint: 'Tunisian databases paper: a theory part (concepts, MCD/relational model questions), then exercises on a described schema (SQL queries, normalisation, integrity).' },
    { id: 'sysres', fr: 'Systèmes d\'exploitation et réseaux', ar: 'نظم التشغيل والشبكات', en: 'Operating systems and networks', lang: 'fr', support: false,
      hint: 'Tunisian operating systems and networks paper: five short exercises (commands, processes, files and rights, addressing and protocols), each with a small scenario and numbered questions.' },
    { id: 'tic', fr: 'TIC', ar: 'تكنولوجيا المعلومات والاتصال', en: 'ICT', lang: 'fr', support: false,
      hint: 'Tunisian ICT paper: a theory part (concepts, true/false) and practical exercises (spreadsheet formulas, document or web page tasks described step by step).' },
    { id: 'techno', fr: 'Technologie', ar: 'التكنولوجيا', en: 'Technology', lang: 'fr', support: false,
      hint: 'Tunisian technology paper built on a technical system described in words: presentation of the system, its functioning, functional analysis, then calculations (gear ratio, torque, logic functions) when relevant.' },
    { id: 'eco', fr: 'Économie', ar: 'الاقتصاد', en: 'Economics', lang: 'fr', support: true,
      hint: 'Tunisian economics paper: two parts of 10 marks, each built on documents (tables, graphs described in words) with questions to analyse, calculate and conclude, then a reasoned answer.' },
    { id: 'gestion', fr: 'Gestion', ar: 'التصرف', en: 'Management', lang: 'fr', math: true, support: false,
      hint: 'Tunisian management paper: a case study with figures; exercises on costs, margins, balance sheet or ratios with numbered questions; calculations shown step by step.' },
    { id: 'italien', fr: 'Italien', ar: 'الإيطالية', en: 'Italian', lang: 'it', support: true,
      hint: 'Tunisian Italian paper built on the support text: comprehension, vocabulary (lessico), grammar, phonetics and a short written production. All in Italian.' },
    { id: 'allemand', fr: 'Allemand', ar: 'الألمانية', en: 'German', lang: 'de', support: true,
      hint: 'Tunisian German paper built on the support text: comprehension, vocabulary, grammar and a short written production. All in German.' },
    { id: 'espagnol', fr: 'Espagnol', ar: 'الإسبانية', en: 'Spanish', lang: 'es', support: true,
      hint: 'Tunisian Spanish paper built on the support text: comprehension, vocabulary, grammar and a short written production. All in Spanish.' },
    { id: 'eveil', fr: 'Éveil scientifique', ar: 'الإيقاظ العلمي', en: 'Science awareness', lang: 'ar', support: false,
      hint: 'Tunisian primary science paper: simple observation questions, matching, true/false with correction. Short sentences adapted to the age of the pupils.' },
    { id: 'artistique', fr: 'Éducation artistique', ar: 'التربية التشكيلية', en: 'Art education', lang: 'ar', support: false,
      hint: 'Short Tunisian art education paper: vocabulary of the visual arts, identifying techniques and an analysis of a work described in words.' },
    { id: 'musique', fr: 'Éducation musicale', ar: 'التربية الموسيقية', en: 'Music education', lang: 'ar', support: false,
      hint: 'Short Tunisian music education paper: theory (notes, rhythm, signs), listening questions described in words and the Tunisian musical heritage.' },
    { id: 'theatre', fr: 'Éducation théâtrale', ar: 'التربية المسرحية', en: 'Drama education', lang: 'ar', support: false,
      hint: 'Short Tunisian drama education paper: vocabulary of the theatre, analysing a scene described in words and short practical situations.' },
  ];

  // ---------- Blueprints: how a real paper of that subject and class group is built ----------
  // dur: minutes {control, synthese}. split: marks per exercise (adds to 20). counts: default questions per type.
  // titles: exercise titles per language. lang: language when it is not the subject's usual one. coef: usual coefficient.
  // n: number of real papers in the sample that this blueprint is based on (0 = from the curriculum, no sample).
  var PLANS = {
    maths: {
      base: { dur: { control: 60, synthese: 90 }, split: [6, 6, 8], titles: exo(3, true), counts: C(3, 0, 5, 1), lang: 'fr', n: 12 },
      s1: { dur: { control: 60, synthese: 60 }, split: [5, 5, 6, 4], titles: exo(4), counts: C(0, 0, 9, 2), n: 4 },
      s2: { dur: { control: 60, synthese: 60 }, split: [5, 8, 7], titles: exo(3), counts: C(2, 0, 6, 2), n: 14 },
      s3: { dur: { control: 120, synthese: 120 }, split: [4, 4, 6, 6], titles: exo(4), counts: C(0, 0, 9, 3), n: 14 },
      bac: { dur: { control: 120, synthese: 120 }, split: [4, 5, 11], titles: exo(3, true), counts: C(2, 0, 6, 2), n: 21 },
    },
    physique: {
      base: { dur: { control: 60, synthese: 90 }, split: [6, 6, 8], titles: exo(3), counts: C(3, 2, 5, 1), lang: 'ar', n: 12 },
      s1: { dur: { control: 60, synthese: 60 }, split: [4, 4, 7, 5], titles: exo(4), counts: C(2, 0, 8, 2), n: 4 },
      s2: { dur: { control: 60, synthese: 120 }, split: [4, 4, 6, 6], titles: exoParts('', '', '', [['Chimie', 'كيمياء', 'Chemistry'], ['Chimie', 'كيمياء', 'Chemistry'], ['Physique', 'فيزياء', 'Physics'], ['Physique', 'فيزياء', 'Physics']]), counts: C(2, 0, 9, 2), n: 9 },
      s3: { dur: { control: 120, synthese: 120 }, split: [4, 4, 6, 6], titles: exoParts('', '', '', [['Chimie', 'كيمياء', 'Chemistry'], ['Chimie', 'كيمياء', 'Chemistry'], ['Physique', 'فيزياء', 'Physics'], ['Physique', 'فيزياء', 'Physics']]), counts: C(2, 0, 9, 2), n: 12 },
      bac: { dur: { control: 120, synthese: 120 }, split: [2.5, 4.5, 7.5, 5.5], titles: exoParts('', '', '', [['Chimie', 'كيمياء', 'Chemistry'], ['Chimie', 'كيمياء', 'Chemistry'], ['Physique', 'فيزياء', 'Physics'], ['Physique', 'فيزياء', 'Physics']]), counts: C(2, 0, 8, 2), coef: '4', n: 17 },
    },
    svt: {
      base: { dur: { control: 45, synthese: 60 }, split: [6, 7, 7], titles: parts(['Restitution des connaissances', 'Exploitation de documents', 'Situation problème'], ['الجزء الأول', 'الجزء الثاني', 'الجزء الثالث'], ['Knowledge', 'Documents', 'Problem situation']), counts: C(3, 3, 3, 1), lang: 'ar', n: 13 },
      s1: { dur: { control: 30, synthese: 60 }, split: [10, 10], titles: exo(2), counts: C(2, 2, 3, 1), n: 3 },
      s2: { dur: { control: 60, synthese: 60 }, split: [6, 6, 8], titles: exo(3), counts: C(3, 2, 3, 1), n: 8 },
      s3: { dur: { control: 60, synthese: 90 }, split: [6, 8, 6], titles: exo(3), counts: C(3, 2, 3, 1), n: 7 },
      bac: { dur: { control: 90, synthese: 90 }, split: [10, 10], titles: parts(['QCM et restitution des connaissances', 'Exploitation de documents'], ['أسئلة المعارف', 'استغلال الوثائق'], ['MCQ and knowledge', 'Documents']), counts: C(4, 0, 4, 1), n: 12 },
    },
    francais: {
      base: { dur: { control: 60, synthese: 90 }, split: [8, 6, 6], titles: parts(['Compréhension', 'Langue', 'Production écrite']), counts: C(2, 0, 7, 1), n: 13 },
      s1: { dur: { control: 60, synthese: 90 }, split: [8, 6, 6], titles: parts(['Compréhension', 'Langue', 'Essai']), counts: C(2, 0, 7, 1), n: 4 },
      s2: { dur: { control: 60, synthese: 120 }, split: [8, 6, 6], titles: parts(['Compréhension', 'Langue', 'Essai']), counts: C(2, 0, 7, 1), n: 14 },
      s3: { dur: { control: 90, synthese: 120 }, split: [8, 6, 6], titles: parts(['Étude de texte', 'Langue et vocabulaire', 'Essai']), counts: C(2, 0, 7, 1), n: 20 },
      bac: { dur: { control: 120, synthese: 120 }, split: [8, 6, 6], titles: parts(['Étude de texte', 'Langue et vocabulaire', 'Essai']), counts: C(2, 0, 7, 1), n: 27 },
    },
    arabe: {
      base: { dur: { control: 60, synthese: 90 }, split: [8, 6, 6], titles: parts(['Compréhension', 'Langue', 'Production écrite'], ['الفهم', 'اللغة', 'الإنتاج الكتابي']), counts: C(2, 0, 7, 1), n: 8 },
      s1: { dur: { control: 60, synthese: 120 }, split: [8, 6, 6], titles: parts(['Compréhension', 'Langue', 'Production écrite'], ['الفهم', 'اللغة', 'الإنتاج الكتابي']), counts: C(2, 0, 7, 1), n: 3 },
      s2: { dur: { control: 60, synthese: 120 }, split: [8, 6, 6], titles: parts(['Compréhension', 'Langue', 'Production écrite'], ['الفهم', 'اللغة', 'الإنتاج الكتابي']), counts: C(2, 0, 7, 1), n: 11 },
      s3: { dur: { control: 120, synthese: 120 }, split: [8, 6, 6], titles: parts(['Compréhension', 'Langue', 'Production écrite'], ['الفهم', 'اللغة', 'الإنتاج الكتابي']), counts: C(2, 0, 7, 1), n: 3 },
      bac: { dur: { control: 120, synthese: 120 }, split: [8, 6, 6], titles: parts(['Compréhension', 'Langue', 'Production écrite'], ['الفهم', 'اللغة', 'الإنتاج الكتابي']), counts: C(2, 0, 7, 1), n: 9 },
    },
    anglais: {
      base: { dur: { control: 60, synthese: 90 }, split: [8, 8, 4], titles: parts(['Reading', 'Language', 'Writing']), counts: C(3, 3, 4, 1), n: 12 },
      s1: { dur: { control: 60, synthese: 90 }, split: [8, 7, 5], titles: parts(['Reading', 'Language', 'Writing']), counts: C(3, 3, 4, 1), n: 3 },
      s2: { dur: { control: 60, synthese: 90 }, split: [8, 7, 5], titles: parts(['Reading', 'Language', 'Writing']), counts: C(3, 3, 4, 1), n: 11 },
      s3: { dur: { control: 60, synthese: 90 }, split: [8, 7, 5], titles: parts(['Reading', 'Language', 'Writing']), counts: C(3, 3, 4, 1), n: 12 },
      bac: { dur: { control: 60, synthese: 90 }, split: [7, 8, 5], titles: parts(['Reading', 'Language', 'Writing']), counts: C(3, 3, 4, 1), coef: '1', n: 25 },
    },
    histoire: {
      base: { dur: { control: 45, synthese: 60 }, split: [6, 7, 7], titles: exo(3), counts: C(3, 3, 3, 1), n: 10 },
      s1: { dur: { control: 60, synthese: 90 }, split: [6, 7, 7], titles: exo(3), counts: C(3, 2, 3, 1), n: 3 },
      s2: { dur: { control: 60, synthese: 90 }, split: [6, 7, 7], titles: exo(3), counts: C(3, 2, 3, 1), n: 5 },
      s3: { dur: { control: 60, synthese: 90 }, split: [6, 7, 7], titles: exo(3), counts: C(3, 2, 3, 1), n: 8 },
      bac: { dur: { control: 90, synthese: 120 }, split: [10, 6, 4], titles: parts(['Manifestations', 'Fondements', 'Limites'], ['المظاهر', 'الدعائم', 'الحدود']), counts: C(2, 0, 4, 1), n: 4 },
    },
    geo: {
      base: { dur: { control: 45, synthese: 60 }, split: [6, 7, 7], titles: exo(3), counts: C(3, 3, 3, 1), n: 8 },
      s1: { dur: { control: 60, synthese: 90 }, split: [6.75, 13.25], titles: parts(['Connaissances', 'Étude de document'], ['المعارف', 'دراسة وثيقة']), counts: C(3, 0, 4, 1), n: 2 },
      s2: { dur: { control: 60, synthese: 90 }, split: [6.75, 13.25], titles: parts(['Connaissances', 'Étude de document'], ['المعارف', 'دراسة وثيقة']), counts: C(3, 0, 4, 1), n: 6 },
      s3: { dur: { control: 60, synthese: 90 }, split: [6.75, 13.25], titles: parts(['Connaissances', 'Étude de document'], ['المعارف', 'دراسة وثيقة']), counts: C(3, 0, 4, 1), n: 3 },
      bac: { dur: { control: 90, synthese: 120 }, split: [6.75, 13.25], titles: parts(['Connaissances', 'Étude de document'], ['المعارف', 'دراسة وثيقة']), counts: C(3, 0, 4, 1), n: 0 },
    },
    civique: { all: { dur: { control: 30, synthese: 45 }, split: [8, 12], titles: exo(2), counts: C(3, 4, 2, 0), n: 20 } },
    islam: {
      base: { dur: { control: 20, synthese: 45 }, split: [20], titles: { fr: ['Situation'], ar: ['الوضعية'], en: ['Situation'] }, counts: C(3, 3, 2, 0), n: 11 },
      s1: { dur: { control: 30, synthese: 60 }, split: [10, 10], titles: exo(2), counts: C(3, 3, 3, 0), n: 2 },
      s2: { dur: { control: 30, synthese: 60 }, split: [10, 10], titles: exo(2), counts: C(3, 3, 3, 0), n: 7 },
      s3: { dur: { control: 45, synthese: 90 }, split: [8, 12], titles: exo(2), counts: C(3, 2, 3, 1), n: 6 },
      bac: { dur: { control: 60, synthese: 90 }, split: [8, 12], titles: exo(2), counts: C(3, 2, 3, 1), n: 3 },
    },
    philo: { all: { dur: { control: 120, synthese: 180 }, split: [2, 2, 3, 13], titles: { fr: ['Exercice 1', 'Exercice 2', 'Exercice 3', 'Traitement du sujet'], ar: ['التمرين الأول', 'التمرين الثاني', 'التمرين الثالث', 'معالجة الموضوع'], en: ['Exercise 1', 'Exercise 2', 'Exercise 3', 'Essay'] }, counts: C(0, 0, 3, 1), n: 28 } },
    info: {
      base: { dur: { control: 45, synthese: 60 }, split: [10, 10], titles: parts(['Partie théorique', 'Partie pratique']), counts: C(5, 4, 3, 0), n: 13 },
      s1: { dur: { control: 45, synthese: 60 }, split: [10, 10], titles: parts(['Partie théorique', 'Partie pratique']), counts: C(5, 4, 3, 0), n: 0 },
      s2: { dur: { control: 60, synthese: 120 }, split: [4, 4, 5, 7], titles: exo(4), counts: C(4, 2, 5, 1), coef: '1', n: 9 },
      s3: { dur: { control: 60, synthese: 60 }, split: [6, 5, 4, 5], titles: parts(['Notions', 'Exemples', 'Exercice', 'Partie pratique']), counts: C(4, 2, 5, 1), coef: '1', n: 19 },
      bac: { dur: { control: 60, synthese: 60 }, split: [5, 7.5, 7.5], titles: parts(['Partie théorique', 'Exercice 1', 'Exercice 2']), counts: C(4, 2, 4, 1), coef: '1', n: 23 },
    },
    algo: {
      s3: { dur: { control: 60, synthese: 120 }, split: [7, 13], titles: exo(2, true), counts: C(0, 0, 3, 2), n: 3 },
      bac: { dur: { control: 120, synthese: 120 }, split: [5, 3, 12], titles: exo(3, true), counts: C(0, 0, 4, 2), coef: '3', n: 5 },
    },
    bdd: { bac: { dur: { control: 120, synthese: 120 }, split: [7.5, 12.5], titles: { fr: ['Partie I : Théorie', 'Partie II : Exercices'], ar: ['الجزء الأول : نظري', 'الجزء الثاني : تمارين'], en: ['Part I: Theory', 'Part II: Exercises'] }, counts: C(4, 2, 5, 0), coef: '1.5', n: 5 } },
    sysres: { s3: { dur: { control: 60, synthese: 60 }, split: [4, 4, 2.5, 4, 5.5], titles: exo(5), counts: C(2, 2, 5, 0), n: 5 }, bac: { dur: { control: 60, synthese: 60 }, split: [4, 4, 2.5, 4, 5.5], titles: exo(5), counts: C(2, 2, 5, 0), n: 0 } },
    tic: {
      s3: { dur: { control: 60, synthese: 60 }, split: [5, 3, 3, 9], titles: { fr: ['Partie théorique', 'Exercice 1', 'Exercice 2', 'Partie pratique'], ar: ['الجزء النظري', 'التمرين الأول', 'التمرين الثاني', 'الجزء التطبيقي'], en: ['Theory part', 'Exercise 1', 'Exercise 2', 'Practical part'] }, counts: C(3, 2, 4, 0), n: 3 },
      bac: { dur: { control: 60, synthese: 60 }, split: [5, 3, 3, 9], titles: { fr: ['Partie théorique', 'Exercice 1', 'Exercice 2', 'Partie pratique'], ar: ['الجزء النظري', 'التمرين الأول', 'التمرين الثاني', 'الجزء التطبيقي'], en: ['Theory part', 'Exercise 1', 'Exercise 2', 'Practical part'] }, counts: C(3, 2, 4, 0), n: 4 },
    },
    techno: {
      base: { dur: { control: 45, synthese: 60 }, split: [6, 7, 7], titles: exo(3), counts: C(5, 3, 4, 0), lang: 'ar', n: 12 },
      s1: { dur: { control: 60, synthese: 120 }, split: [5, 7, 8], titles: parts(['Description du système', 'Fonctionnement', 'Fonctions logiques'], ['وصف المنظومة', 'عمل المنظومة', 'الدوال المنطقية']), counts: C(4, 2, 5, 0), coef: '1', n: 5 },
      s2: { dur: { control: 60, synthese: 120 }, split: [10, 10], titles: parts(['Analyse du système', 'Étude technique'], ['تحليل المنظومة', 'الدراسة التقنية']), counts: C(3, 2, 5, 0), n: 8 },
      s3: { dur: { control: 120, synthese: 240 }, split: [4, 6, 10], titles: parts(['Mise en situation', 'Fonctionnement du système', 'Étude et calculs'], ['التقديم', 'عمل المنظومة', 'الدراسة والحسابات']), counts: C(3, 2, 6, 0), n: 4 },
      bac: { dur: { control: 120, synthese: 240 }, split: [4, 6, 10], titles: parts(['Mise en situation', 'Description du système', 'Étude et calculs'], ['التقديم', 'وصف المنظومة', 'الدراسة والحسابات']), counts: C(3, 2, 6, 0), n: 5 },
    },
    eco: {
      s2: { dur: { control: 60, synthese: 90 }, split: [10, 10], titles: exo(2), counts: C(3, 2, 3, 1), n: 3 },
      s3: { dur: { control: 120, synthese: 180 }, split: [10, 10], titles: parts(['Étude de documents', 'Raisonnement']), counts: C(3, 2, 3, 1), coef: '4', n: 4 },
      bac: { dur: { control: 180, synthese: 180 }, split: [10, 10], titles: { fr: ['Partie I', 'Partie II'], ar: ['الجزء الأول', 'الجزء الثاني'], en: ['Part I', 'Part II'] }, counts: C(3, 2, 3, 1), coef: '4', n: 4 },
    },
    gestion: {
      s2: { dur: { control: 60, synthese: 120 }, split: [10, 10], titles: exo(2), counts: C(2, 2, 5, 1), n: 1 },
      s3: { dur: { control: 120, synthese: 180 }, split: [10, 10], titles: exo(2), counts: C(2, 2, 5, 1), coef: '4', n: 5 },
      bac: { dur: { control: 180, synthese: 180 }, split: [10, 10], titles: { fr: ['Partie 1 : Étude de cas', 'Partie 2 : Exercices'], ar: ['الجزء الأول : دراسة حالة', 'الجزء الثاني : تمارين'], en: ['Part 1: Case study', 'Part 2: Exercises'] }, counts: C(2, 2, 5, 1), coef: '4', n: 4 },
    },
    italien: { all: { dur: { control: 60, synthese: 90 }, split: [6, 4, 6, 4], titles: { fr: ['I- Compréhension', 'II- Lexique', 'III- Grammaire', 'IV- Phonétique'], ar: ['I- Comprensione', 'II- Lessico', 'III- Grammatica', 'IV- Fonetica'], en: ['I- Comprensione', 'II- Lessico', 'III- Grammatica', 'IV- Fonetica'], it: ['I- Comprensione', 'II- Lessico', 'III- Grammatica', 'IV- Fonetica'] }, counts: C(3, 2, 6, 1), n: 20 } },
    allemand: { all: { dur: { control: 60, synthese: 90 }, split: [6, 4, 6, 4], titles: { de: ['I- Leseverstehen', 'II- Wortschatz', 'III- Grammatik', 'IV- Schreiben'], fr: ['I- Compréhension', 'II- Lexique', 'III- Grammaire', 'IV- Expression écrite'], ar: ['I- Leseverstehen', 'II- Wortschatz', 'III- Grammatik', 'IV- Schreiben'], en: ['I- Reading', 'II- Vocabulary', 'III- Grammar', 'IV- Writing'] }, counts: C(3, 2, 6, 1), n: 12 } },
    espagnol: { all: { dur: { control: 60, synthese: 90 }, split: [6, 4, 6, 4], titles: { es: ['I- Comprensión', 'II- Léxico', 'III- Gramática', 'IV- Expresión escrita'], fr: ['I- Compréhension', 'II- Lexique', 'III- Grammaire', 'IV- Expression écrite'], ar: ['I- Comprensión', 'II- Léxico', 'III- Gramática', 'IV- Expresión escrita'], en: ['I- Reading', 'II- Vocabulary', 'III- Grammar', 'IV- Writing'] }, counts: C(3, 2, 6, 1), n: 6 } },
    eveil: { all: { dur: { control: 45, synthese: 60 }, split: [8, 12], titles: exo(2), counts: C(4, 3, 3, 0), n: 0 } },
    artistique: { all: { dur: { control: 30, synthese: 45 }, split: [8, 12], titles: exo(2), counts: C(3, 3, 3, 0), n: 8 } },
    musique: { all: { dur: { control: 30, synthese: 45 }, split: [8, 12], titles: exo(2), counts: C(3, 3, 3, 0), n: 2 } },
    theatre: { all: { dur: { control: 30, synthese: 45 }, split: [10, 10], titles: exo(2), counts: C(3, 3, 3, 0), n: 3 } },
    histgeo: { all: { dur: { control: 60, synthese: 90 }, split: [10, 10], titles: parts(['Histoire', 'Géographie'], ['التاريخ', 'الجغرافيا'], ['History', 'Geography']), counts: C(4, 3, 3, 1), n: 0 } },
  };

  // ---------- Subjects of each class (from the sample, completed with the curriculum) ----------
  var LANGS3 = ['italien', 'allemand', 'espagnol'];
  var SETS = {
    primary: ['arabe', 'francais', 'maths', 'eveil', 'anglais', 'islam', 'civique'],
    base: ['maths', 'physique', 'svt', 'arabe', 'francais', 'anglais', 'histoire', 'geo', 'civique', 'islam', 'info', 'techno', 'artistique', 'musique', 'theatre'],
    s1: ['maths', 'physique', 'svt', 'arabe', 'francais', 'anglais', 'histoire', 'geo', 'techno', 'islam'],
    s2l: ['arabe', 'francais', 'anglais', 'histoire', 'geo', 'maths', 'svt', 'islam', 'civique'],
    s2s: ['maths', 'physique', 'svt', 'arabe', 'francais', 'anglais', 'histoire', 'geo', 'techno', 'civique', 'islam'],
    s2e: ['eco', 'gestion', 'maths', 'info', 'arabe', 'francais', 'anglais', 'histoire', 'geo', 'civique', 'islam'],
    s2t: ['maths', 'physique', 'techno', 'info', 'arabe', 'francais', 'anglais', 'histoire', 'geo', 'civique', 'islam'],
    l: ['arabe', 'francais', 'anglais', 'histoire', 'geo', 'philo', 'islam', 'info', 'maths'].concat(LANGS3),
    m: ['maths', 'physique', 'info', 'philo', 'arabe', 'francais', 'anglais', 'svt', 'histoire', 'islam'].concat(LANGS3),
    s: ['maths', 'physique', 'svt', 'philo', 'arabe', 'francais', 'anglais', 'info', 'histoire', 'geo', 'islam'].concat(LANGS3),
    e: ['eco', 'gestion', 'maths', 'info', 'philo', 'histoire', 'geo', 'arabe', 'francais', 'anglais', 'islam'].concat(LANGS3),
    t: ['maths', 'physique', 'techno', 'info', 'philo', 'histoire', 'arabe', 'francais', 'anglais', 'islam'].concat(LANGS3),
    i: ['maths', 'physique', 'algo', 'bdd', 'sysres', 'tic', 'philo', 'arabe', 'francais', 'anglais', 'islam'].concat(LANGS3),
  };

  function findSubject(id) { return SUBJECTS.filter(function (s) { return s.id === id; })[0] || SUBJECTS[0]; }
  function findLevel(id) {
    for (var g = 0; g < LEVELS.length; g++) for (var i = 0; i < LEVELS[g].items.length; i++) if (LEVELS[g].items[i].id === id) return LEVELS[g].items[i];
    return LEVELS[1].items[2];
  }

  function subjectIdsFor(levelId) {
    var lv = findLevel(levelId);
    if (lv.cycle === 'primary') return SETS.primary;
    if (lv.cycle === 'base') return SETS.base;
    var year = levelId.charAt(1), sec = levelId.charAt(2);
    var set = year === '1' ? SETS.s1 : year === '2' ? (SETS['s2' + sec] || SETS.s2s) : (SETS[sec] || SETS.s);
    // Italian, German and Spanish are optional subjects in every lycée class (they raise the average).
    return set.filter(function (id) { return LANGS3.indexOf(id) < 0; }).concat(LANGS3);
  }
  function isOption(subjectId) { return LANGS3.indexOf(subjectId) >= 0; }

  // The blueprint for a subject in a class. Falls back to the closest class group, then to a generic shape.
  function plan(subjectId, levelId) {
    var s = findSubject(subjectId);
    var key = cycleKey(levelId);
    var byCycle = PLANS[s.id] || {};
    var order = { primary: ['primary', 'base'], base: ['base', 's1'], s1: ['s1', 's2', 'base'], s2: ['s2', 's1', 's3'], s3: ['s3', 'bac', 's2'], bac: ['bac', 's3', 's2'] }[key] || [key];
    var p = byCycle.all || null;
    var matched = !!p || !!byCycle[key];
    for (var i = 0; !p && i < order.length; i++) p = byCycle[order[i]] || null;
    if (!p) p = { dur: { control: 60, synthese: 90 }, split: [10, 10], titles: exo(2), counts: C(4, 2, 3, 1), n: 0 };
    var lang = p.lang || s.lang;
    // Primary schools teach these in Arabic.
    if (key === 'primary' && ['maths', 'eveil', 'civique', 'islam'].indexOf(s.id) >= 0) lang = 'ar';
    return { dur: p.dur, split: p.split, ex: p.split.length, titles: p.titles, counts: p.counts, lang: lang, coef: p.coef || '', n: matched ? (p.n || 0) : 0, hint: s.hint, support: s.support, math: !!s.math };
  }

  function defaultLang(subjectId, levelId) { return plan(subjectId, levelId).lang; }

  // Display name of a subject in a language for a class (islamic education becomes islamic thought in the lycée).
  function subjectLabel(subjectId, levelId, lang) {
    var s = findSubject(subjectId);
    var lv = findLevel(levelId);
    var alt = s.names && s.names[lv.cycle === 'sec' ? 'sec' : lv.cycle];
    var src = alt || s;
    return src[lang] || s[lang] || s.fr;
  }

  // ---------- Labels of the paper in each exam language ----------
  var L = {
    fr: {
      dir: 'ltr', republic: 'République Tunisienne', ministry: "Ministère de l'Éducation",
      school: 'Établissement', schoolPh: { base: 'Collège …', sec: 'Lycée …', primary: 'École …' }, subject: 'Épreuve', level: 'Classe', duration: 'Durée',
      coef: 'Coefficient', teacher: 'Prof', date: 'Date', year: 'Année scolaire', name: 'Nom et prénom',
      num: 'N°', note: 'Note', classShort: 'Classe', letters: 'ABCDEFGH', tf: ['Vrai', 'Faux'],
      answer: 'Réponse', from: 'Source', rubric: 'Barème', support: 'Texte',
      pagesA: "L'épreuve comporte", pagesB: "pages",
      instructions: 'Répondez directement sur la feuille. Soignez la présentation et la rédaction.',
      defRubric: "Note complète : énonce l'idée principale et donne un détail tiré du cours.",
      newQ: 'Écrivez la question ici.', choice: function (j) { return 'Choix ' + 'ABCDEFGH'[j]; },
      exercise: function (n) { return 'Exercice ' + n; },
      pts: function (n) { return n + (Number(n) === 1 ? ' point' : ' points'); },
      qnum: function (n) { return n + ')'; },
    },
    ar: {
      dir: 'rtl', republic: 'الجمهورية التونسية', ministry: 'وزارة التربية',
      school: 'المؤسسة', schoolPh: { base: 'المدرسة الإعدادية …', sec: 'المعهد …', primary: 'المدرسة الابتدائية …' }, subject: 'المادة', level: 'القسم', duration: 'المدة',
      coef: 'الضارب', teacher: 'الأستاذ', date: 'التاريخ', year: 'السنة الدراسية', name: 'الاسم واللقب',
      num: 'عدد', note: 'العدد', classShort: 'القسم', letters: 'أبجدهوزح', tf: ['صحيح', 'خطأ'],
      answer: 'الإجابة', from: 'المصدر', rubric: 'سلم الإسناد', support: 'النص',
      pagesA: "يحتوي الفرض على", pagesB: "صفحات",
      instructions: 'أجب مباشرة على ورقة الامتحان مع العناية بالخط وسلامة التعبير.',
      defRubric: 'العدد كاملا: يذكر الفكرة الرئيسية ويدعمها بمثال من الدرس.',
      newQ: 'اكتب السؤال هنا.', choice: function (j) { return 'اختيار ' + 'أبجدهوزح'[j]; },
      exercise: function (n) { return 'التمرين ' + (ORD_AR[n - 1] || n); },
      pts: function (n) { return n + (Number(n) === 1 ? ' نقطة' : ' نقاط'); },
      qnum: function (n) { return n + '-'; },
    },
    en: {
      dir: 'ltr', republic: 'Republic of Tunisia', ministry: 'Ministry of Education',
      school: 'School', schoolPh: { base: 'Collège …', sec: 'Lycée …', primary: 'School …' }, subject: 'Subject', level: 'Class', duration: 'Time',
      coef: 'Coefficient', teacher: 'Teacher', date: 'Date', year: 'School year', name: 'Full name',
      num: 'No.', note: 'Mark', classShort: 'Class', letters: 'ABCDEFGH', tf: ['True', 'False'],
      answer: 'Answer', from: 'Source', rubric: 'Marking scheme', support: 'Text',
      pagesA: "This paper has", pagesB: "pages",
      instructions: 'Answer directly on the paper. Write clearly.',
      defRubric: 'Full marks: states the main idea and gives one supporting detail from the lesson.',
      newQ: 'Type the question here.', choice: function (j) { return 'Choice ' + 'ABCDEFGH'[j]; },
      exercise: function (n) { return 'Exercise ' + n; },
      pts: function (n) { return n + (Number(n) === 1 ? ' mark' : ' marks'); },
      qnum: function (n) { return n + ')'; },
    },
    it: {
      dir: 'ltr', republic: 'Repubblica Tunisina', ministry: "Ministero dell'Istruzione",
      school: 'Istituto', schoolPh: { base: 'Scuola media …', sec: 'Liceo …', primary: 'Scuola …' }, subject: 'Materia', level: 'Classe', duration: 'Durata',
      coef: 'Coefficiente', teacher: 'Prof.', date: 'Data', year: 'Anno scolastico', name: 'Nome e cognome',
      num: 'N°', note: 'Voto', classShort: 'Classe', letters: 'ABCDEFGH', tf: ['Vero', 'Falso'],
      answer: 'Risposta', from: 'Fonte', rubric: 'Griglia', support: 'Testo',
      pagesA: "La prova comprende", pagesB: "pagine",
      instructions: 'Rispondi direttamente sul foglio. Scrivi con cura.',
      defRubric: "Punteggio pieno: indica l'idea principale e un dettaglio del testo.",
      newQ: 'Scrivi qui la domanda.', choice: function (j) { return 'Scelta ' + 'ABCDEFGH'[j]; },
      exercise: function (n) { return 'Esercizio ' + n; },
      pts: function (n) { return n + (Number(n) === 1 ? ' punto' : ' punti'); },
      qnum: function (n) { return n + ')'; },
    },
    de: {
      dir: 'ltr', republic: 'Republik Tunesien', ministry: 'Bildungsministerium',
      school: 'Schule', schoolPh: { base: 'Schule …', sec: 'Gymnasium …', primary: 'Schule …' }, subject: 'Fach', level: 'Klasse', duration: 'Dauer',
      coef: 'Koeffizient', teacher: 'Lehrer', date: 'Datum', year: 'Schuljahr', name: 'Name und Vorname',
      num: 'Nr.', note: 'Note', classShort: 'Klasse', letters: 'ABCDEFGH', tf: ['Richtig', 'Falsch'],
      answer: 'Antwort', from: 'Quelle', rubric: 'Bewertung', support: 'Text',
      pagesA: "Die Arbeit umfasst", pagesB: "Seiten",
      instructions: 'Antworte direkt auf dem Blatt. Schreibe sauber.',
      defRubric: 'Volle Punktzahl: nennt die Hauptidee und ein Detail aus dem Text.',
      newQ: 'Schreibe die Frage hier.', choice: function (j) { return 'Wahl ' + 'ABCDEFGH'[j]; },
      exercise: function (n) { return 'Aufgabe ' + n; },
      pts: function (n) { return n + (Number(n) === 1 ? ' Punkt' : ' Punkte'); },
      qnum: function (n) { return n + ')'; },
    },
    es: {
      dir: 'ltr', republic: 'República Tunecina', ministry: 'Ministerio de Educación',
      school: 'Centro', schoolPh: { base: 'Colegio …', sec: 'Instituto …', primary: 'Escuela …' }, subject: 'Materia', level: 'Clase', duration: 'Duración',
      coef: 'Coeficiente', teacher: 'Profesor', date: 'Fecha', year: 'Año escolar', name: 'Nombre y apellidos',
      num: 'N.º', note: 'Nota', classShort: 'Clase', letters: 'ABCDEFGH', tf: ['Verdadero', 'Falso'],
      answer: 'Respuesta', from: 'Fuente', rubric: 'Baremo', support: 'Texto',
      pagesA: "El examen tiene", pagesB: "páginas",
      instructions: 'Responde directamente en la hoja. Cuida la presentación.',
      defRubric: 'Puntuación completa: expresa la idea principal y un detalle del texto.',
      newQ: 'Escribe aquí la pregunta.', choice: function (j) { return 'Opción ' + 'ABCDEFGH'[j]; },
      exercise: function (n) { return 'Ejercicio ' + n; },
      pts: function (n) { return n + (Number(n) === 1 ? ' punto' : ' puntos'); },
      qnum: function (n) { return n + ')'; },
    },
  };

  // Visual designs, modelled on real Tunisian papers:
  //   lycee   : bordered header box (school, boxed title, section / coefficient, subject, teacher / duration / date, number of pages)
  //   college : simple header (school and year, underlined title, one row of fields), name line and note box
  //   institut: Arabic style, coloured band with the institute and year, framed text, right to left
  //   clean   : the modern, airy layout of the app
  var DESIGNS = ['lycee', 'college', 'institut', 'clean'];
  function defaultDesign(levelId, lang) {
    if (lang === 'ar') return 'institut';
    var c = findLevel(levelId).cycle;
    return c === 'sec' ? 'lycee' : 'college';
  }

  function schoolPlaceholder(levelId, lang) {
    var c = findLevel(levelId).cycle;
    var o = (L[lang] || L.fr).schoolPh;
    return o[c] || o.sec;
  }

  function fmtDuration(min, lang) {
    min = Number(min) || 0;
    var h = Math.floor(min / 60), m = min % 60;
    if (lang === 'ar') {
      if (!h) return m + ' دقيقة';
      var hs = h === 1 ? 'ساعة' : h === 2 ? 'ساعتان' : h + ' ساعات';
      return m === 30 ? (h === 1 ? 'ساعة ونصف' : hs + ' ونصف') : (m ? hs + ' و' + m + ' دقيقة' : hs);
    }
    var unit = { fr: ['heure', 'heures', 'min'], en: ['hour', 'hours', 'min'], it: ['ora', 'ore', 'min'], de: ['Stunde', 'Stunden', 'Min.'], es: ['hora', 'horas', 'min'] }[lang] || ['h', 'h', 'min'];
    return (h ? h + ' ' + (h === 1 ? unit[0] : unit[1]) : '') + (h && m ? ' ' : '') + (m ? m + ' ' + unit[2] : '');
  }

  function schoolYear(now) {
    var d = now || new Date();
    var y = d.getFullYear();
    return d.getMonth() >= 7 ? y + '/' + (y + 1) : (y - 1) + '/' + y;
  }

  function kindTitle(kindId, num, lang) {
    var k = KINDS[kindId] || KINDS.control;
    var base = k[lang] || k.fr;
    if (!num) return base;
    return base + ({ ar: ' عدد ' + num, en: ' No. ' + num, de: ' Nr. ' + num, es: ' n.º ' + num }[lang] || ' N°' + num);
  }

  // Titles of the exercises of a paper: the blueprint's titles, completed with generic ones if the teacher
  // asks for more exercises than the blueprint has.
  function groupTitles(subjectId, levelId, lang, count) {
    var p = plan(subjectId, levelId);
    var t = (p.titles[lang] || p.titles.fr || []).slice();
    var out = [];
    for (var i = 1; i <= count; i++) out.push(t[i - 1] || (L[lang] || L.fr).exercise(i));
    return out;
  }
  function groupTitle(subjectId, lang, n, levelId) {
    return groupTitles(subjectId, levelId || 'b9', lang, n)[n - 1];
  }

  // Marks per exercise for a paper with `count` exercises, or null when the blueprint cannot be reused as is.
  function splitFor(subjectId, levelId, count) {
    var p = plan(subjectId, levelId);
    return p.split.length === count ? p.split.slice() : null;
  }

  return {
    LEVELS: LEVELS, KINDS: KINDS, LANGS: LANGS, SUBJECTS: SUBJECTS, L: L, PLANS: PLANS,
    cycleKey: cycleKey, plan: plan, defaultLang: defaultLang, subjectIdsFor: subjectIdsFor, isOption: isOption, subjectLabel: subjectLabel,
    DESIGNS: DESIGNS, defaultDesign: defaultDesign, schoolPlaceholder: schoolPlaceholder, fmtDuration: fmtDuration, schoolYear: schoolYear, findSubject: findSubject,
    findLevel: findLevel, kindTitle: kindTitle, groupTitle: groupTitle, groupTitles: groupTitles, splitFor: splitFor,
  };
});
