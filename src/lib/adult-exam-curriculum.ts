/** Adult exam-only Kamoku snapshot. Source audit: docs/superpowers/adult-exam-curriculum-source-audit.md. */
export type AdultGakkaDelivery = {
  mode: "oral" | "written-required" | "written-choice" | "external";
  timing: "advance" | "exam-day" | "external";
};
export type AdultExamCurriculumItem = {
  gakka?: AdultGakkaDelivery;
  section: string;
  name: string;
  summary?: string;
  coverageNames?: string[];
};
export const ADULT_EXAM_CURRICULUM_GRADES = [
  "5 KYU",
  "4 KYU",
  "3 KYU",
  "2 KYU",
  "1 KYU",
  "1 DAN",
  "2 DAN",
  "3 DAN",
  "4 DAN",
  "5 DAN",
] as const;
const BASE: Record<string, Record<string, string[]>> = {
  "5kyu": {
    Goho: [
      "Uchi uke zuki (ura)",
      "Tenshin geri",
      "Uwa uke zuki (ura)",
      "Uwa uke geri",
    ],
    Juho: [
      "Yori nuki (katate)",
      "Kote nuki",
      "Gyaku gote, mae yubi gatame",
      "Ude juji (katame to renko)",
    ],
    "Tai gamae": ["Chudan gamae", "Ichiji gamae", "Tai gamae", "Hiraki gamae"],
    Keimyaku: ["Suigetsu", "Mikazuki", "Hakusetsu"],
    "Umpo ho": [
      "Chidori ashi",
      "Kani ashi",
      "Kumo ashi",
      "Juji ashi",
      "Sashi komi ashi",
      "Zen tenkan",
      "Han tenkan",
    ],
    Ukemi: ["Daisharin", "Yoko ukemi"],
    "Kata tan-en": ["Tenchiken dai ichi", "Ryuo ken dai ichi"],
    Randori: ["Gentei goho (single attacks)"],
    Gakka: [
      "Dokun (recitar Seiku y Seigan)",
      "Cómo comportarse en el dojo",
      "Cómo sentarse y respirar durante zazen",
      "Lista de vocabulario 1",
    ],
  },
  "4kyu": {
    Goho: [
      "Mae ryusui geri",
      "Shita uke geri",
      "Tsuki ten ichi",
      "Juji uke geri (omote)",
      "Uwa uke zuki (omote) renhanko",
    ],
    Juho: [
      "Maki nuki (katate)",
      "Ryote yori nuki",
      "Johaku nuki (katate & ryote)",
      "Johaku dori (katate & ryote)",
      "Sode nuki (katate & ryote)",
    ],
    "Tai gamae": ["Gedan gamae", "Gyaku gedan gamae", "Hasso gamae"],
    Keimyaku: ["Mae zanmai", "Yoko zanmai", "Shin-e", "Hyaku-e"],
    "Umpo ho": [
      "Sashi kae ashi",
      "Fumi komi ashi",
      "Zen tenkan & han tenkan from kesshu gamae",
    ],
    Ukemi: ["Ushiro ukemi"],
    "Kata tan-en": ["Giwa ken dai ichi"],
    "Kata sotai": ["Tenchi ken dai ichi", "Ryuo ken dai ichi"],
    Randori: ["Gentei goho (combinations)", "Gentei juho (single grabs)"],
    Gakka: [
      "Dokun (recitar Shinjo)",
      "Elementos básicos para principiantes",
      "La naturaleza única del Shorinji Kempo",
      "Lista de vocabulario 2",
    ],
    Embu: [
      "Kumi embu list 1: select option A or B and perform with a partner, following taikai rules",
    ],
  },
  "3kyu": {
    Goho: [
      "Soto uke zuki (ura) renhanko",
      "Soto uke zuki (omote) renhanko",
      "Tsubame gaeshi renhanko",
      "Ushiro ryusui geri",
      "Shita uke jun geri",
      "Uchi uke geri (ura)",
      "Uchi uke geri (omote)",
    ],
    Juho: [
      "Katate okuri gote",
      "Okuri maki tembin",
      "Kiri nuki (uchi)",
      "Kiri nuki (soto)",
      "Tsuki nuki (soto)",
      "Tsuki nuki (uchi)",
      "Ryote tsuki nuki",
      "Juji nuki (katate & ryote)",
    ],
    "Tai gamae": ["Taiki gamae"],
    Keimyaku: ["Sango", "Yongo", "Tenchu", "Amon"],
    Ukemi: ["Mae ukemi"],
    "Kata tan-en": ["Tenchi ken dai ni"],
    Randori: [
      "Gentei goho (combination attacks)",
      "Gentei juho (grabs with strikes)",
    ],
    Gakka: [
      "Doshin So y la fundación del Shorinji Kempo",
      "Sobre Chinkon",
      "El Dokun",
      "Qué es el Budo y por qué lo practicamos",
      "Gyo: la disciplina del Shorinji Kempo",
      "Mitad para tu propia felicidad, mitad para la de los demás",
    ],
    Embu: [
      "Kumi embu list 2: select option A or B and perform with a partner, following taikai rules",
    ],
  },
  "2kyu": {
    Goho: [
      "Uchi age zuki (ura & omote)",
      "Uchi age geri (ura & omote)",
      "Soto uke geri (ura & omote)",
      "Soto oshi uke zuki",
      "Uchi oshi uke zuki",
      "Chidori gaeshi kari ashi",
      "Kinteki (gyaku) geri hiza uke nami gaeshi",
    ],
    Juho: [
      "Ude juji, tate gassho gatame",
      "Ryote maki nuki",
      "Ryote okuri gote, ura gatame",
      "Johaku maki",
      "Juji gote (katate & ryote)",
      "Nidan nuki",
      "Morote tsuki nuki",
      "Gassho nuki",
      "Gyaku gote ura gaeshi nage",
    ],
    "Tai gamae": ["Midare gamae"],
    Keimyaku: ["Sunmyaku", "San inko", "Fushi"],
    Ukemi: ["Tobi komi mae ukemi (to clear obstacle)"],
    "Kata tan-en": ["Tenchi ken dai san & yon", "Giwa ken dai ni"],
    "Kata sotai": ["Giwa ken dai ichi"],
    Randori: ["Goho free randori", "Gentei juho randori"],
    Gakka: [
      "Establécete a ti mismo y vive en armonía con los demás",
      "Ken Zen Ichi Nyo",
      "Riki Ai Funi",
      "Pautas para un entrenamiento eficaz",
      "La mentalidad de crecimiento",
      "Ars Longa, Vita Brevis",
    ],
    Embu: [
      "Kumi embu list 3: construct an embu using any six listed sequences, following taikai rules",
    ],
  },
  "1kyu": {
    Goho: [
      "Kusshin zuki",
      "Kusshin geri",
      "Kusshin zuki geri",
      "Han tenshin geri",
      "Yoko tenshin geri",
      "Uchi uke zuki (omote)",
      "Furi ten ni",
      "Tsuki ten ni",
    ],
    Juho: [
      "Oshi kiri nuki",
      "Kiri kaeshi nuki (katate)",
      "Kiri kaeshi nuki (morote)",
      "Kiri gote (katate & morote)",
      "Sankaku nuki",
      "Sode dori",
      "Sode maki",
      "Sode maki tembin",
      "Eri nuki",
      "Ude maki",
      "Eri juji",
      "Kata muna otoshi",
      "Ryaku juji gote",
      "Maki juji gote",
      "Oshi gote (katate & ryote)",
    ],
    "Tai gamae": ["Tate muso gamae", "Yoko muso gamae"],
    Keimyaku: ["Kekkai", "Matsukaze", "Rinkyu", "Danchu"],
    Ukemi: ["Tobi ukemi from nage waza (gyaku gote)"],
    "Kata sotai": ["Tenchi ken dai ni"],
    Randori: ["Goho free randori", "Gentei juho randori"],
    Gakka: [
      "Shushu Koju",
      "Fusatsu Katsujin",
      "Go Ju Ittai",
      "Kumite Shutai",
      "Fuhai Shoju",
      "Los tres niveles de dominio de un arte (Gi, Jutsu, Ryaku)",
      "Las tres etapas del aprendizaje de una habilidad (Shu, Ha, Ri)",
    ],
    Embu: [
      "Kumi embu list 4: construct a six-sequence embu using techniques from the list and perform with a partner, following taikai rules",
    ],
  },
  shodan: {
    Goho: [
      "Harai uke geri",
      "Gedan gaeshi",
      "Gyaku tenshin geri",
      "Shita uke zuki (ura & omote)",
      "Keri ten san (omote)",
      "Keri ten san (ura)",
      "Kaishin zuki (ura & omote)",
      "Tsuki ten san (ura)",
      "Tsuki ten san (omote)",
      "Uchi oshi uke geri (ura & omote)",
      "Soto oshi uke geri",
      "Mawashi geri sambo uke nami gaeshi",
    ],
    Juho: [
      "Uchi nuki (katate & ryote)",
      "Gyaku tembin",
      "Morote oshi nuki",
      "Hiki otoshi",
      "Morote hiki nuki",
      "Katate maki gote",
      "Ude gyaku dori to morote maki gote",
      "Morote juji nuki",
      "Morote juji gote",
      "Shita uke geri kote nage",
      "Kiri kaeshi tembin (katate & morote)",
      "Kiri kaeshi maki tembin",
      "Katate oshi nuki",
      "Kote maki gaeshi",
    ],
    "Tai gamae": ["Nio gamae"],
    Ukemi: ["Ippon se nage"],
    "Kata tan-en": ["Tenchi ken dai go & roku", "Byakuren ken dai ichi"],
    Randori: ["Goho free randori with protectors", "Gentei juho randori"],
    Keimyaku: ["Kisha", "Bukkotsu", "Chuin", "Nichigetsu"],
    Gakka: [
      "Entrega previa: ¿Qué es la verdadera fuerza?",
      "Entrega previa: tus motivos para empezar Shorinji Kempo y tu estado mental actual",
      "Las enseñanzas clave del Shorinji Kempo",
      "Pautas para un entrenamiento eficaz",
      "Los tres niveles de dominio de un arte",
      "Las tres etapas del aprendizaje de una habilidad",
      "Tipos de entrenamiento",
      "Los cinco elementos del atemi",
      "Sen",
      "Ma'ai",
    ],
    Embu: ["Self-constructed kumi embu, following taikai rules"],
  },
  nidan: {
    Goho: [
      "Tai ten ichi",
      "Gyaku ten ichi (ura & omote)",
      "Kon ten ichi",
      "Jun geri chi ichi",
      "Gyaku geri chi ichi",
      "Harai uke chi ni",
      "Jun geri chi san",
      "Gyaku geri chi san",
      "Hangetsu geri",
      "Keri ten ichi sukui kubi nage",
      "Tanto furi age ryusui geri",
      "Tanto tsuki komi shita uke uchi otoshi geri",
      "Tanto tsuki komi shita uke geri kote nage",
    ],
    Juho: [
      "Gyakute nage, gyakute gatame",
      "Ryu nage, ryu gatame",
      "Soto maki tembin",
      "Uwa uke nage",
      "Uwa uke gyakute nage",
      "Hiki tembin",
      "Gyaku hiki tembin",
      "Gassho hiki tembin",
      "Morote maki nuki",
      "Morote wa nuki",
      "Morote gyaku gote",
      "Morote okuri gote, baku ho ichi",
      "Okuri tembin dori (two types)",
      "Okuri dori",
      "Okuri hiji zeme",
      "Hiji nuki mae tembin",
      "Tsuri otoshi",
      "Tsuri age dori",
      "Hiki muna otoshi",
      "Ryo muna otoshi",
      "Maki otoshi",
      "Soto maki otoshi",
      "Nuki uchi oshi gote",
      "Ninin nuki",
    ],
    "Kata tan-en": [
      "Tenchi ken dai ichi - dai roku (migi & hidari)",
      "Giwa ken dai ichi - dai ni",
      "Byakuren ken dai ichi",
      "Ko manji ken",
    ],
    "Kata sotai": ["Giwa ken dai ichi", "Tenchi ken dai ni"],
    Randori: ["Goho free randori with protectors", "Gentei juho randori"],
    Shakujo: [
      "Shakujo kihon furi",
      "Tenchi ken dai ichi - dai san",
      "Giwa ken dai ichi - dai ni",
    ],
    Gakka: [
      "Entrega previa: mitad para tu propia felicidad, mitad para la de los demás",
      "Entrega previa: sobre la defensa personal",
      "En el examen: establécete a ti mismo y vive en armonía con los demás",
      "En el examen: el poder del Ki",
      "En el examen: Bodhidharma, el Zen y el templo Shaolin",
      "En el examen: 3 recipientes, 3 sistemas, 25 grupos",
      "En el examen: graduaciones y rangos en Shorinji Kempo",
      "En el examen: historia de la BSKF",
      "En el examen: el Manji y el significado del logo de la BSKF",
    ],
    Embu: ["Kumi embu autoconstruido, siguiendo las reglas de taikai"],
    Keimyaku: [
      "Suigetsu",
      "Mikazuki",
      "Hakusetsu",
      "Mae zanmai",
      "Yoko zanmai",
      "Shin-e",
      "Hyaku-e",
      "Sango",
      "Yongo",
      "Tenchu",
      "Amon",
      "Sunmyaku",
      "San inko",
      "Fushi",
      "Kekkai",
      "Matsukaze",
      "Rinkyu",
      "Danchu",
      "Kisha",
      "Bukkotsu",
      "Chuin",
      "Nichigetsu",
    ],
  },
  sandan: {
    Goho: [
      "Machi geri",
      "Dan geri sambo uke dan geri gaeshi",
      "Sokuto geri hiki ashi nami gaeshi",
      "Mikazuki gaeshi kari ashi",
      "Suigetsu gaeshi oshi taoshi",
      "Hangetsu gaeshi sukui kubi nage",
      "Chudan gaeshi ren han ko",
      "Fukko chi ni",
      "Soto uke dan zuki",
      "Uchi age dan zuki",
      "Shita uke dan zuki",
      "Harai uke dan zuki",
      "Uwa uke zuki with nyoi",
    ],
    Juho: [
      "Age nuki",
      "Idori okuri gote",
      "Idori gyaku gote",
      "Idori oshi gote",
      "Katate nage",
      "Gyaku katate nage",
      "Okuri katate nage",
      "Gassho katate nage",
      "Ryote katate nage",
      "Morote katate nage",
      "Sode maki gaeshi",
      "Sode guchi dori",
      "Sode guchi maki",
      "Kiri kaeshi gote",
      "Kiri kaeshi nage",
      "Morote kiri kaeshi nage",
      "Uwa uke se nage",
      "Furi sute omote nage",
      "Morote okuri gote nage",
      "Okuri tsuki taoshi",
      "Koshi kujiki",
      "Konoha okuri",
      "Konoha gaeshi",
      "Okuri yubi gaeshi",
      "Okuri shishi dori",
      "Gassho okuri dori",
      "Nigiri gaeshi",
    ],
    "Kata tan-en": [
      "Ko manji ken (2nd section ryuo ken dai ichi, 4th section ryu no kata)",
    ],
    Randori: [
      "Goho free randori with protectors",
      "Gentei juho randori",
      "Gentei go-ju randori (single attack)",
    ],
    Shakujo: [
      "Tenchi ken dai yon - dai roku",
      "Byakuren ken dai ichi (2 versions)",
      "Ido enren dai ichi - dai ni",
    ],
    Gakka: [
      "Entrega previa: Doshin So y la fundación del Shorinji Kempo",
      "Entrega previa: Gyo, la disciplina del Shorinji Kempo",
      "En el examen: el Dokun",
      "En el examen: sobre Kongo Zen",
      "En el examen: los elementos clave de la enseñanza de Buda",
      "En el examen: Dharma",
      "En el examen: destino y libre albedrío",
      "En el examen: karma y destino",
      "En el examen: el Camino Medio",
    ],
    Embu: ["Kumi embu autoconstruido, siguiendo las reglas de taikai"],
    Keimyaku: ["Todos los keimyaku del programa"],
  },
  yondan: {
    Juho: [
      "Bukkotsu nage",
      "Harai bukkotsu nage",
      "Ushiro bukkotsu nage",
      "Kubi jime shuho juji nage",
      "Kubi jime nage",
      "Kenjime dori",
      "Tembin nage",
      "Katate kumade gaeshi",
      "Ryote kumade gaeshi",
      "Okuri gassho (two types)",
      "Kannuki okuri dori",
      "Kannuki soto tembin",
      "Gassho gyaku gote",
      "Gyaku gassho nage (two types)",
      "Gyaku sode dori",
      "Gyaku sode maki",
      "Hangetsu kubi nage",
      "Osae kannuki nage soto",
      "Osae kannuki nage uchi",
      "Omote nage",
      "Ura nage",
      "Maki uchi kubi nage",
      "Katate nage kiri kaeshi",
      "Okuri kannuki gote",
      "Maki komi gote",
      "Okuri eri dori",
      "Ushiro eri dori",
      "Yahazu nage",
      "Ushiro kubi nage",
      "Ushiro sode maki (dori)",
      "Oshi uke nage",
      "Oshi uke maki nage",
      "Gassho choji",
      "Gassho tsuki otoshi",
      "Ashi nuki (two types)",
    ],
    Goho: [
      "Chudan gaeshi to uchi uke zuki",
      "Gedan gaeshi to tobi ni ren geri",
    ],
    "Kata tan-en": ["All (hidari and migi)"],
    "Kata sotai": ["All (hidari and migi)"],
    Randori: [
      "Goho free randori with protectors",
      "Gentei juho randori",
      "Gentei go-ju randori",
    ],
    Shakujo: [
      "Tenchi ken dai ichi - dai roku (hidari & migi)",
      "Ko manji ken",
      "Ido enren dai san - dai roku",
    ],
    Appo: ["Oyayubi zeme", "Yongo zeme", "Sango zeme", "Bukkotsu zeme"],
    Gakka: [
      "Entrega previa: sobre el liderazgo en Shorinji Kempo",
      "Entrega previa: las Cuatro Nobles Verdades",
      "Entrega previa: el Noble Óctuple Sendero",
      "Entrega previa: vacuidad y no-yo",
      "Entrega previa: budismo y moralidad",
      "Entrega previa: budismo y ciencia",
    ],
    Embu: ["Kumi embu autoconstruido, siguiendo las reglas de taikai"],
    Keimyaku: ["Todos los keimyaku del programa"],
  },
  godan: {
    Juho: [
      "Kannuki katate nage",
      "Katate kannuki nage",
      "Ryote kannuki nage",
      "Kannuki nai tembin",
      "Tekubi dori",
      "Choji dori",
      "Mae gami dori",
      "Sode juji",
      "Shikumi koshi nage",
      "Shikumi nai tembin",
      "Obi dori",
      "Kata uchi nage",
      "Tora daoshi (2 types)",
      "Fukko daoshi (3 types)",
      "Hasami daoshi (2 types)",
      "Hagai jime to shuho",
      "Sode dori nai tembin",
      "Sode maki gaeshi ura",
      "Okuri eri dori omote",
      "Kubi jime nage omote",
      "Choji nage",
      "Okuri gassho konoha nage",
      "Konoha choji",
      "Gyaku konoha gaeshi",
      "Omote kumade gaeshi",
      "Okuri hiji zeme omote",
      "Uchi gyakute dori",
      "Soto gyakute dori",
      "Kote nage from jo chu ni ren zuki",
    ],
    "Kata tan-en": ["All (hidari and migi)"],
    "Kata sotai": ["All (hidari and migi)"],
    Randori: [
      "Goho free randori with protectors",
      "Gentei juho randori",
      "Gentei go-ju randori",
    ],
    "Shakujo tan-en": [
      "Tenchi ken dai ichi - dai roku (hidari & migi)",
      "Giwaken dai ichi - dai ni",
      "Byakuren ken dai ichi",
      "Ko manji ken (migi & hidari)",
      "Ido enren dai ichi - dai ju (hidari & migi)",
    ],
    "Shakujo sotai": [
      "Uwa uke uchi otoshi",
      "Yoko uke shigoki zuki",
      "Tenchi ken dai ichi",
      "Byakuren ken dai ichi",
      "Randori (foam bo)",
    ],
    Appo: [
      "Tsurigane zeme",
      "Sunmyaku zeme",
      "Gokoku zeme",
      "Shikoku zeme",
      "Yako zeme",
    ],
    Gakka: ["Requisitos para Daikenshi: se examinan por separado"],
    Embu: ["Kumi embu autoconstruido, siguiendo las reglas de taikai"],
  },
};
const EMBU_LISTS = {
  four: "Select option A or B to perform with a partner, following taikai rules.\nOption A\n1. Uchi uke zuki & gyaku gote\n2. Juji uke geri & maki nuki\n3. Tenshin geri & ude juji renko\n4. Tenchiken dai ichi sotai\n5. Tsuki ten ichi & yori nuki\n6. Uwa uke zuki (ura) & johaku dori\nOption B\n1. Mae ryusui geri & ryote yori nuki\n2. Johaku nuki & uwa uke geri\n3. Uwa uke zuki (omote) & ryote sode nuki\n4. Ryuoken dai ichi sotai\n5. Uchi uke zuki & johaku dori\n6. Shita uke geri & gyaku gote",
  three:
    "Select option A or B to perform with a partner, following taikai rules.\nOption A\n1. Soto uke zuki & gyaku gote\n2. Juji uke geri & okuri maki tembin\n3. Tsubame gaeshi & ude juji renko\n4. Tenchiken dai ichi sotai\n5. Tsuki ten ichi & okuri gote\n6. Uwa uke zuki (ura) & ryote johaku dori\nOption B\n1. Mae ryusui geri & okuri maki tembin\n2. Uwa uke zuki (omote) & kiri nuki\n3. Uchi uke zuki & ryote tsuki nuki\n4. Ryote yori nuki & juji uke geri\n5. Uwa uke geri & johaku dori\n6. Shita uke geri & okuri gote",
  two: "Construct an embu using any six of the following sequences, following taikai rules. If not\nspecified, you are free to choose between ura/omote, katate/ryote etc.\nJuji uke geri & gyaku gote\nSoto oshi uke zuki & tsuki nuki\nTsubame gaeshi & okuri gote\nJohaku nuki & chidori gaeshi kari ashi\nShita uke geri & sode nuki\nTenchiken dai ichi (sotai)\nJuji nuki & soto uke geri\nTsuki ten ichi & juji gote\nRyuo ken dai ichi (sotai)\nUchi uke geri & ude juji\nShita uke jun geri & okuri maki tembin\nUchi age zuki & johaku dori\nSoto uke zuki & ryote yori nuki\nMaki nuki & uchi age geri",
  one: "Construct a six-sequence embu using techniques from the list below, and perform with a\npartner following taikai rules. If not specified, you are free to choose between ura/omote,\nkatate/ryote etc.\nUwa uke zuki\nSoto oshi uke zuki\nSoto uke geri\nChidori gaeshi kari ashi\nKusshin zuki geri\nUshiro ryusui geri\nShita uke geri\nTsuki ten ichi\nJuji uke geri\nTenchiken dai ni (sotai)\nHan tenshin geri\nUchi uke geri\nRyote maki nuki\nGassho nuki\nSankaku nuki\nOshi kiri nuki\nUde juji\nGyaku gote\nOkuri gote\nKiri gote\nJuji gote\nJohaku dori\nSode maki tembin\nUde maki",
};
const SOURCE_PAGES: Record<string, string> = {
  "5kyu": "Kyu, página impresa 1 (PDF 3)",
  "4kyu": "Kyu, página 2 (PDF 4)",
  "3kyu": "Kyu, páginas 3–4 (PDF 5–6)",
  "2kyu": "Kyu, páginas 5–6 (PDF 7–8)",
  "1kyu": "Kyu, páginas 7–8 (PDF 9–10)",
  shodan: "Kyu, páginas 9–11 (PDF 11–13)",
  nidan: "Dan, páginas 1–2 (PDF 3–4)",
  sandan: "Dan, páginas 3–4 (PDF 5–6)",
  yondan: "Dan, páginas 5–6 (PDF 7–8)",
  godan: "Dan, páginas 7–8 (PDF 9–10)",
};
const KNOWN_KEIMYAKU = BASE.nidan.Keimyaku.join(", ");
const VOCAB_1 =
  "Migi: derecha; Hidari: izquierda; Jun: lado delantero; Gyaku: lado trasero/inverso; Jo-/chu-/ge-(dan): nivel alto/medio/bajo; Kesshu: adoptar kesshu gamae; Rei: realizar gassho rei; Naore: volver a kesshu; Kamae: guardia; Hajime: comenzar; Yame: parar; Kiai: grito.";
const VOCAB_2 =
  "tsuki (-zuki): golpe de puño; keri (-geri): patada; uke: bloqueo; ukemi: caída; nuki: liberación; kote (-gote): muñeca; dori: derribo; kiritsu: ponerse de pie; chakuza: sentarse; seiza: arrodillado; anza: medio loto (traducción de la tabla); o-negai shimasu: por favor; arigato gozaimashita: gracias. Números: ichi 1; ni 2; san 3; shi/yon 4; go 5; roku 6; shichi/nana 7; hachi 8; kyu 9; ju 10.";
const EMBU_RULES =
  "Seis secuencias de hokei (con ren han ko y katame) o kata sotai, sin superar el temario de los participantes. Dos personas alternan atacante y defensor en cada secuencia; la pareja no necesita examinarse. Duración 90–120 segundos. Valorar por separado precisión técnica y estilo/espíritu/estructura: timing, kime, kiryoku, kisei, kiai, construcción, kamae, realismo, uso del espacio y sincronización. Descontar errores técnicos, técnicas ajenas al kempo o al nivel y desviaciones importantes de la composición indicada; se puede reconocer la dificultad. Fuente: Kyu p.14 / Dan p.10.";
const KNOWN_TANEN =
  "Tenchi ken dai ichi, ni, san, yon, go y roku; Ryuo ken dai ichi; Giwa ken dai ichi y ni; Byakuren ken dai ichi; Ko manji ken (incluida la composición descrita para Sandan)";
const KNOWN_SOTAI =
  "Tenchi ken dai ichi y ni; Ryuo ken dai ichi; Giwa ken dai ichi";
const ORDINALS = [
  "ichi",
  "ni",
  "san",
  "yon",
  "go",
  "roku",
  "shichi",
  "hachi",
  "kyu",
  "ju",
];
function gradeKey(grade: string | null | undefined) {
  const value = String(grade ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  return (
    (
      {
        "1dan": "shodan",
        "2dan": "nidan",
        "3dan": "sandan",
        "4dan": "yondan",
        "5dan": "godan",
      } as Record<string, string>
    )[value] ?? value
  );
}
/** Expand only explicitly named kata ranges; a source's unspecified "All" is never guessed. */
function expandKata(name: string) {
  const normalized = name.replace(/^Giwaken /, "Giwa ken ");
  const range = normalized.match(
    /^(.*?) dai (ichi|ni|san|yon|go|roku|shichi|hachi|ku|ju)\s*-\s*dai (ichi|ni|san|yon|go|roku|shichi|hachi|ku|ju)(.*)$/,
  );
  if (range) {
    const from = ORDINALS.indexOf(range[2]),
      to = ORDINALS.indexOf(range[3]);
    return ORDINALS.slice(from, to + 1).map(
      (ordinal) => `${range[1]} dai ${ordinal}${range[4]}`,
    );
  }
  const pair = normalized.match(
    /^(.*?) dai (ichi|ni|san|yon|go|roku) & (ichi|ni|san|yon|go|roku)(.*)$/,
  );
  return pair
    ? [
        `${pair[1]} dai ${pair[2]}${pair[4]}`,
        `${pair[1]} dai ${pair[3]}${pair[4]}`,
      ]
    : [normalized];
}
function explicitCoverage(name: string) {
  const coverage = new Set<string>([name]);
  // These forms are explicitly required together in the source; unspecified variants remain untouched.
  for (const [left, right] of [
    ["ura", "omote"],
    ["katate", "ryote"],
    ["katate", "morote"],
  ]) {
    const token = `(${left} & ${right})`;
    if (name.includes(token)) {
      coverage.add(name.replace(token, `(${left})`));
      coverage.add(name.replace(token, `(${right})`));
    }
  }
  const linked: Record<string, string[]> = {
    "Ude gyaku dori to morote maki gote": [
      "Ude gyaku dori",
      "Morote maki gote",
    ],
    "Chudan gaeshi to uchi uke zuki": ["Chudan gaeshi", "Uchi uke zuki"],
    "Gedan gaeshi to tobi ni ren geri": ["Gedan gaeshi", "Tobi ni ren geri"],
  };
  for (const part of linked[name] ?? []) coverage.add(part);
  if (name.includes(", "))
    for (const part of name.split(", "))
      coverage.add(part.charAt(0).toUpperCase() + part.slice(1));
  for (const [spaced, compact] of [
    ["Tenchi ken", "Tenchiken"],
    ["Giwa ken", "Giwaken"],
    ["Ryuo ken", "Ryuoken"],
    ["Byakuren ken", "Byakurenken"],
  ]) {
    if (name.startsWith(spaced + " "))
      coverage.add(name.replace(spaced, compact));
    else if (name.startsWith(compact + " "))
      coverage.add(name.replace(compact, spaced));
  }
  return [...coverage];
}
function summaryFor(
  key: string,
  section: string,
  name: string,
  sourceName: string,
) {
  const source = `BSKF Kamoku, 2.ª edición (2024), ${SOURCE_PAGES[key]}.`;
  const context: string[] = [source];
  if (section === "Goho")
    context.push(
      "Salvo indicación específica de la técnica: defensor en ichiji gamae y atacante en chudan gamae (nota inicial de ambos libros).",
    );
  if (section === "Juho")
    context.push(
      "Salvo indicación específica de la técnica: defensor y atacante en chudan gamae (nota inicial de ambos libros). Las técnicas compuestas y variantes indicadas se conservan juntas.",
    );
  if (section === "Goho" && ["2kyu", "1kyu"].includes(key))
    context.push("Todo el Goho de este grado se realiza con ren han ko.");
  if (section.includes("Kata") || section.includes("Shakujo")) {
    if (name !== sourceName)
      context.push(
        `Ejercicio desglosado del requisito explícito: ${sourceName}.`,
      );
    if (sourceName.startsWith("All "))
      context.push(
        `Todos, a izquierda y derecha. Nombres explícitos recuperables del programa previo: ${section === "Kata sotai" ? KNOWN_SOTAI : KNOWN_TANEN}. «All» no enumera un catálogo adicional; no se añaden formas no nombradas por estas fuentes.`,
      );
  }
  if (section === "Keimyaku") {
    if (key === "nidan")
      context.push(
        "Requisito Shokenshi: todos los puntos hasta Shodan (Dan p.9); este es uno de los 22 puntos nombrados explícitamente en las páginas de grados Kyu/Shodan.",
      );
    else if (["sandan", "yondan"].includes(key))
      context.push(
        `Gakka/hokai ${key === "sandan" ? "Chukenshi" : "Seikenshi"}: todos los keimyaku (Dan p.9). Puntos nombrados en el temario textual: ${KNOWN_KEIMYAKU}. Los diagramas de Dan pp.11–12 no contienen etiquetas recuperables en el extracto: verificar el conjunto completo en el diagrama oficial; no se inventan nombres ni localizaciones.`,
      );
    else
      context.push(
        "Identificar este punto conforme al diagrama oficial de keimyaku (Kyu p.15); el extracto no permite recuperar las etiquetas o localizaciones del diagrama.",
      );
  }
  if (section === "Gakka") {
    if (name === "Lista de vocabulario 1")
      context.push("Lista 1, Kyu p.16: " + VOCAB_1);
    if (name === "Lista de vocabulario 2")
      context.push("Lista 2, Kyu p.16: " + VOCAB_2);
    if (["5kyu", "4kyu"].includes(key))
      context.push("Gakka oral según la página del grado.");
    if (["3kyu", "2kyu", "1kyu"].includes(key))
      context.push("Gakka escrito según la página del grado.");
    if (key === "shodan")
      context.push(
        "Dos trabajos a entregar previamente; en la convocatoria se eligen tres temas entre los ocho indicados. La presencia de cada tema en esta lista representa el banco completo, no ocho pruebas simultáneas.",
      );
    if (["nidan", "sandan"].includes(key))
      context.push(
        `Gakka/hokai ${key === "nidan" ? "Shokenshi" : "Chukenshi"} (Dan p.9): dos trabajos previos y tres temas seleccionados de los siete indicados para la convocatoria; no son siete pruebas simultáneas.`,
      );
    if (key === "yondan")
      context.push(
        "Gakka/hokai Seikenshi (Dan p.9): seis trabajos previos; no se requiere prueba teórica en la convocatoria.",
      );
    if (key === "godan")
      context.push(
        "El hokai Daikenshi se examina por separado; el libro no enumera aquí sus materias. No sustituirlo por una prueba local ni inventar temas o una aprobación: comprobar la evaluación externa correspondiente.",
      );
  }
  if (section === "Shakujo sotai" && name === "Randori (foam bo)")
    context.push(
      "Randori con bo de espuma, situado en el bloque Shakujo sotai de Godan (Dan p.8), no randori sin armas.",
    );
  if (section === "Embu") {
    if (key === "4kyu")
      context.push(
        "Lista 1: elegir la opción A o B completa (seis secuencias cada una). " +
          EMBU_LISTS.four,
      );
    else if (key === "3kyu")
      context.push(
        "Lista 2: elegir la opción A o B completa (seis secuencias cada una). " +
          EMBU_LISTS.three,
      );
    else if (key === "2kyu")
      context.push(
        "Lista 3: elegir seis de las 14 secuencias; ura/omote o katate/ryote son libres solo cuando la lista no lo especifica. " +
          EMBU_LISTS.two,
      );
    else if (key === "1kyu")
      context.push(
        "Lista 4: construir seis secuencias con las 24 entradas autorizadas; variantes libres solo si no se especifican. " +
          EMBU_LISTS.one,
      );
    else
      context.push(
        "Kumi embu autoconstruido, conforme al nivel y a las reglas comunes.",
      );
    context.push(EMBU_RULES);
  }
  return context.join(" ");
}
function gakkaDelivery(key: string, name: string): AdultGakkaDelivery {
  if (key === "5kyu" || key === "4kyu")
    return { mode: "oral", timing: "exam-day" };
  if (["3kyu", "2kyu", "1kyu"].includes(key))
    return { mode: "written-required", timing: "exam-day" };
  if (key === "godan") return { mode: "external", timing: "external" };
  if (key === "yondan" || name.startsWith("Entrega previa:"))
    return { mode: "written-required", timing: "advance" };
  return { mode: "written-choice", timing: "exam-day" };
}
/** Complete source-backed adult exam requirements, independent from training/progression data. */
export function getAdultExamCurriculum(
  grade: string | null | undefined,
): AdultExamCurriculumItem[] {
  const key = gradeKey(grade),
    blocks = BASE[key];
  if (!blocks) return [];
  const result: AdultExamCurriculumItem[] = [];
  for (const [section, names] of Object.entries(blocks))
    for (const sourceName of names) {
      const expanded =
        section.includes("Kata") || section.includes("Shakujo")
          ? expandKata(sourceName)
          : [sourceName];
      for (const name of expanded)
        result.push({
          section,
          name,
          summary: summaryFor(key, section, name, sourceName),
          coverageNames: explicitCoverage(name),
          ...(section === "Gakka"
            ? { gakka: gakkaDelivery(key, sourceName) }
            : {}),
        });
    }
  return [
    ...result.filter((item) => item.section !== "Embu"),
    ...result.filter((item) => item.section === "Embu"),
  ];
}
