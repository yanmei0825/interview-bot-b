import { DimensionKey, Language } from "./types";

export interface DimensionDef {
  key: DimensionKey;
  name: Record<Language, string>;
  focus: Record<Language, string>;
  starterQuestions: Record<Language, string[]>;
  probeQuestions: Record<Language, string[]>;
  minTurns: number;
  maxTurns: number;
  coverageThreshold: number;
}

export const DIMENSIONS: DimensionDef[] = [
  {
    key: "D1",
    name: { en: "Success", ru: "Успех", tr: "Başarı" },
    focus: {
      en: "What does success look like for this person at work — moments of pride, achievement, results they own.",
      ru: "Что для человека означает успех на работе — моменты гордости, достижения, результаты.",
      tr: "Bu kişi için işte başarı nasıl görünür — gurur anları, başarılar, sahip oldukları sonuçlar.",
    },
    starterQuestions: {
      en: [
        "In the last two weeks, tell me about a specific moment at work when you felt genuinely proud of what you accomplished.",
        "What's one thing you've delivered recently that you'd point to as a real win — something concrete?",
      ],
      ru: [
        "За последние две недели расскажи о конкретном моменте, когда ты гордился своим достижением.",
        "Что ты недавно сделал, что можешь назвать реальной победой — что-то конкретное?",
      ],
      tr: [
        "Son iki haftada, gerçekten gurur duyduğun belirli bir anı anlat.",
        "Son zamanlarda teslim ettiğin ve gerçek bir kazanım olarak gösterebileceğin bir şey nedir?",
      ],
    },
    probeQuestions: {
      en: [
        "What specifically made that feel like a win — was it the result, the process, or how others reacted?",
        "Who else was involved, and what was your unique contribution that made the difference?",
        "How did that moment compare to other successes you've had here?",
        "What would it take to feel that way more often?",
      ],
      ru: [
        "Что конкретно сделало это победой — результат, процесс или реакция других?",
        "Кто ещё был вовлечён, и какой был твой уникальный вклад?",
        "Как этот момент сравнивается с другими успехами здесь?",
        "Что нужно, чтобы чувствовать это чаще?",
      ],
      tr: [
        "Bunu kazanım hissettiren şey tam olarak nedir — sonuç, süreç, yoksa diğerlerinin tepkisi?",
        "Başka kimler vardı ve senin benzersiz katkın neydi?",
        "Bu an buradaki diğer başarılarınla nasıl karşılaştırılır?",
        "Bunu daha sık hissetmek için ne gerekir?",
      ],
    },
    minTurns: 2,
    maxTurns: 5,
    coverageThreshold: 0.75,
  },
  {
    key: "D2",
    name: { en: "Security/Value", ru: "Безопасность/Ценность", tr: "Güvenlik/Değer" },
    focus: {
      en: "Whether the person feels stable, valued, and fairly treated — pay, recognition, job security.",
      ru: "Чувствует ли человек стабильность, ценность и справедливое отношение — зарплата, признание, стабильность.",
      tr: "Kişinin kendini güvende, değerli ve adil muamele görüyor hissedip hissetmediği.",
    },
    starterQuestions: {
      en: [
        "How settled do you feel in your role right now — do you feel your position is genuinely secure, or is there uncertainty?",
        "When you think about your compensation and benefits, do you feel they fairly reflect the value you bring?",
      ],
      ru: [
        "Насколько ты чувствуешь себя устойчиво в своей роли — твоя позиция действительно безопасна?",
        "Когда ты думаешь о своей зарплате и льготах, они справедливо отражают твой вклад?",
      ],
      tr: [
        "Şu an rolünde ne kadar yerleşik hissediyorsun — pozisyonun gerçekten güvende mi?",
        "Maaş ve faydalarını düşündüğünde, getirdiğin değeri adil bir şekilde yansıtıyor mu?",
      ],
    },
    probeQuestions: {
      en: [
        "What specifically gives you that sense of security — or what's shaking it?",
        "Can you give me a concrete recent example of when you felt valued or undervalued?",
        "How does your compensation compare to what you think is fair for your role?",
        "Has your sense of security changed in the last year?",
      ],
      ru: [
        "Что конкретно даёт тебе ощущение безопасности — или что его подрывает?",
        "Приведи конкретный пример, когда ты чувствовал себя ценным или нет?",
        "Как твоя зарплата сравнивается с тем, что ты считаешь справедливым?",
        "Изменилось ли твоё ощущение безопасности за последний год?",
      ],
      tr: [
        "Sana güvenlik hissini veren şey tam olarak nedir — ya da onu ne sarsıyor?",
        "Kendini değerli ya da değersiz hissettiğin somut bir örnek verebilir misin?",
        "Maaşın, rolün için adil olduğunu düşündüğün şeyle nasıl karşılaştırılır?",
        "Güvenlik hissin son bir yılda değişti mi?",
      ],
    },
    minTurns: 2,
    maxTurns: 5,
    coverageThreshold: 0.75,
  },
  {
    key: "D3",
    name: { en: "Relationships", ru: "Отношения", tr: "İlişkiler" },
    focus: {
      en: "Quality of working relationships — team, manager, trust, conflict, support.",
      ru: "Качество рабочих отношений — команда, руководитель, доверие, конфликты, поддержка.",
      tr: "Çalışma ilişkilerinin kalitesi — ekip, yönetici, güven, çatışma, destek.",
    },
    starterQuestions: {
      en: [
        "Think about the people you work with most closely — how would you honestly describe the dynamic?",
        "Is there someone at work you genuinely trust and can count on when things get difficult?",
      ],
      ru: [
        "Подумай о людях, с которыми работаешь ближе всего — как бы ты честно описал динамику?",
        "Есть ли на работе кто-то, кому ты действительно доверяешь и можешь рассчитывать в трудный момент?",
      ],
      tr: [
        "En yakın çalıştığın kişileri düşün — dinamiği dürüstçe nasıl tanımlarsın?",
        "İşte gerçekten güvenip zor anlarda güvenebileceğin biri var mı?",
      ],
    },
    probeQuestions: {
      en: [
        "What does that relationship actually look like day to day — give me a specific example?",
        "Has there been a recent moment where that trust was tested or strengthened?",
        "How do you handle disagreements or conflicts with your team?",
        "Do you feel supported by your manager — in what ways, or not?",
      ],
      ru: [
        "Как эти отношения выглядят в повседневной жизни — приведи конкретный пример?",
        "Был ли недавно момент, когда это доверие проверялось или укреплялось?",
        "Как ты справляешься с разногласиями или конфликтами в команде?",
        "Чувствуешь ли ты поддержку от своего руководителя — в каких отношениях?",
      ],
      tr: [
        "Bu ilişki günlük hayatta nasıl görünüyor — somut bir örnek ver?",
        "Son zamanlarda bu güvenin sınandığı ya da güçlendirildiği bir an oldu mu?",
        "Ekibinle anlaşmazlıkları ya da çatışmaları nasıl çözersiniz?",
        "Yöneticinden destek hissediyor musun — hangi yönlerden?",
      ],
    },
    minTurns: 2,
    maxTurns: 5,
    coverageThreshold: 0.75,
  },
  {
    key: "D4",
    name: { en: "Autonomy", ru: "Автономия", tr: "Özerklik" },
    focus: {
      en: "How much control the person has over their work — decisions, methods, schedule, freedom to act.",
      ru: "Насколько человек контролирует свою работу — решения, методы, расписание, свобода действий.",
      tr: "Kişinin işi üzerinde ne kadar kontrolü olduğu — kararlar, yöntemler, program, hareket özgürlüğü.",
    },
    starterQuestions: {
      en: [
        "In the last two weeks, think about how you actually spend your time — how much of that is your choice versus what's dictated to you?",
        "Are there decisions you wish you could make yourself but can't, or have to ask permission for?",
      ],
      ru: [
        "За последние две недели подумай, как ты проводишь время — сколько это твой выбор, а сколько диктуется?",
        "Есть ли решения, которые ты хотел бы принимать сам, но не можешь или должен просить разрешение?",
      ],
      tr: [
        "Son iki haftada, zamanını nasıl harcadığını düşün — ne kadarı senin seçimin, ne kadarı dikte ediliyor?",
        "Kendin vermek isteyip de veremediğin ya da izin istemen gereken kararlar var mı?",
      ],
    },
    probeQuestions: {
      en: [
        "Give me a specific example of a time you had real ownership over something — what did that feel like?",
        "What happens when you push back or suggest a different way of doing something?",
        "How much flexibility do you have with your schedule or how you approach your tasks?",
        "Is there a decision you've wanted to make but felt you couldn't — what stopped you?",
      ],
      ru: [
        "Приведи конкретный пример, когда у тебя было реальное владение чем-то — как это ощущалось?",
        "Что происходит, когда ты возражаешь или предлагаешь другой подход?",
        "Насколько у тебя есть гибкость в расписании или в подходе к задачам?",
        "Есть ли решение, которое ты хотел принять, но чувствовал, что не можешь — что тебя остановило?",
      ],
      tr: [
        "Bir şeyin gerçek sahibi olduğun belirli bir örnek ver — nasıl hissettirdi?",
        "Karşı çıktığında ya da farklı bir yol önerdiğinde ne oluyor?",
        "Programın ya da görevlerine yaklaşımında ne kadar esnekliğin var?",
        "Vermek isteyip de veremediğini hissettiğin bir karar var mı — seni ne durdurdu?",
      ],
    },
    minTurns: 2,
    maxTurns: 5,
    coverageThreshold: 0.75,
  },
  {
    key: "D5",
    name: { en: "Engagement", ru: "Вовлечённость", tr: "Bağlılık" },
    focus: {
      en: "Energy, motivation, flow — whether work feels meaningful or draining day to day, moments of absorption.",
      ru: "Энергия, мотивация, поток — ощущает ли человек смысл или опустошение в повседневной работе, моменты поглощённости.",
      tr: "Enerji, motivasyon, akış — işin günlük olarak anlamlı mı yoksa yorucu mu hissettirdiği, sürüklenme anları.",
    },
    starterQuestions: {
      en: [
        "On a typical week, when do you feel most switched on and energized at work — what are you usually doing?",
        "Is there a part of your job that genuinely pulls you in — where time just disappears and you're absorbed?",
      ],
      ru: [
        "В типичную неделю, когда ты чувствуешь себя наиболее включённым и энергичным на работе — что ты обычно делаешь?",
        "Есть ли часть работы, которая по-настоящему захватывает тебя — где время летит и ты полностью поглощён?",
      ],
      tr: [
        "Tipik bir haftada işte en çok ne zaman kendini enerjik ve aktif hissediyorsun — genellikle ne yapıyorsun?",
        "İşinin seni gerçekten içine çeken, zamanın nasıl geçtiğini anlamadığın bir parçası var mı?",
      ],
    },
    probeQuestions: {
      en: [
        "What's the opposite — what drains you most, and how often does that happen?",
        "How often does that energizing, absorbed feeling actually happen in a typical week?",
        "What specifically about those tasks makes them engaging — is it the challenge, the impact, the people?",
        "Do you leave work feeling energized or exhausted most days?",
      ],
      ru: [
        "А что наоборот — что больше всего тебя истощает, и как часто это происходит?",
        "Как часто это ощущение энергии и поглощённости на самом деле случается в типичную неделю?",
        "Что конкретно в этих задачах делает их увлекательными — сложность, влияние, люди?",
        "Ты уходишь с работы энергичным или истощённым в большинстве дней?",
      ],
      tr: [
        "Bunun tersi nedir — seni en çok ne tüketiyor ve bu ne sıklıkla oluyor?",
        "Bu enerji verici, sürüklenme hissi tipik bir haftada ne sıklıkla gerçekten oluyor?",
        "Bu görevleri ilgi çekici yapan şey tam olarak nedir — zorluk, etki, insanlar mı?",
        "Çoğu gün işten enerjik mi yoksa tükenmiş mi ayrılıyorsun?",
      ],
    },
    minTurns: 2,
    maxTurns: 5,
    coverageThreshold: 0.75,
  },
  {
    key: "D6",
    name: { en: "Recognition/Feedback", ru: "Признание/Обратная связь", tr: "Tanınma/Geri Bildirim" },
    focus: {
      en: "Whether the person gets useful feedback and feels their work is seen and acknowledged — quality of recognition.",
      ru: "Получает ли человек полезную обратную связь и чувствует ли, что его работу замечают и признают.",
      tr: "Kişinin yararlı geri bildirim alıp almadığı ve çalışmasının görülüp takdir edilip edilmediği.",
    },
    starterQuestions: {
      en: [
        "When was the last time someone gave you feedback that actually helped you improve or understand something?",
        "Do you feel like the people above you — your manager, leadership — really see and acknowledge what you contribute?",
      ],
      ru: [
        "Когда последний раз кто-то давал тебе обратную связь, которая реально помогла тебе улучшиться или что-то понять?",
        "Чувствуешь ли ты, что люди выше тебя — твой руководитель, руководство — действительно видят и признают твой вклад?",
      ],
      tr: [
        "En son ne zaman sana gerçekten iyileşmene ya da bir şeyi anlamanı yardımcı olan geri bildirim aldın?",
        "Üstlerinin — yöneticinin, liderliğin — katkılarını gerçekten görüp tanıdığını hissediyor musun?",
      ],
    },
    probeQuestions: {
      en: [
        "What made that feedback land well — or if it didn't, what was missing?",
        "What kind of recognition actually matters to you — public praise, private acknowledgment, tangible rewards?",
        "How often do you get meaningful feedback about your work?",
        "Is there something you've done that you felt deserved recognition but didn't get it?",
      ],
      ru: [
        "Что сделало эту обратную связь полезной — или если нет, что было не так?",
        "Какое признание на самом деле важно для тебя — публичная похвала, личное признание, материальные награды?",
        "Как часто ты получаешь значимую обратную связь о своей работе?",
        "Есть ли что-то, что ты сделал и чувствовал, что это заслуживает признания, но не получил его?",
      ],
      tr: [
        "Bu geri bildirimi iyi yapan neydi — ya da iyi değilse, ne eksikti?",
        "Sana gerçekten önemli gelen tanınma türü nedir — halka açık övgü, özel tanınma, maddi ödüller?",
        "Çalışman hakkında ne sıklıkla anlamlı geri bildirim alıyorsun?",
        "Yaptığın ve tanınmayı hak ettiğini hissettiğin ama almadığın bir şey var mı?",
      ],
    },
    minTurns: 2,
    maxTurns: 5,
    coverageThreshold: 0.75,
  },
  {
    key: "D7",
    name: { en: "Learning", ru: "Обучение", tr: "Öğrenme" },
    focus: {
      en: "Growth, skill development, whether the person feels they're moving forward or stagnating — development opportunities.",
      ru: "Рост, развитие навыков — чувствует ли человек движение вперёд или застой, возможности развития.",
      tr: "Büyüme, beceri geliştirme — kişinin ilerlediğini mi yoksa durağanlaştığını mı hissettirdiği, gelişim fırsatları.",
    },
    starterQuestions: {
      en: [
        "Have you learned something genuinely new at work in the last few months — a skill, perspective, or capability?",
        "Do you feel like you're growing and developing in this role, or more like you're treading water?",
      ],
      ru: [
        "Ты узнал что-то по-настоящему новое на работе за последние несколько месяцев — навык, перспективу, способность?",
        "Чувствуешь ли ты, что растёшь и развиваешься в этой роли, или скорее топчешься на месте?",
      ],
      tr: [
        "Son birkaç ayda işte gerçekten yeni bir şey öğrendin mi — bir beceri, perspektif, yetenek?",
        "Bu rolde büyüdüğünü ve geliştiğini mi hissediyorsun, yoksa yerinde mi sayıyorsun?",
      ],
    },
    probeQuestions: {
      en: [
        "What's been the biggest thing you've picked up or learned recently?",
        "Is there something you want to learn or develop that you're not getting the chance to?",
        "How does your manager or team support your growth — or do they?",
        "What would help you feel like you're actually progressing?",
      ],
      ru: [
        "Что самое значимое ты усвоил или узнал в последнее время?",
        "Есть ли что-то, чему ты хочешь научиться или развить, но не получаешь такой возможности?",
        "Как твой руководитель или команда поддерживают твой рост — или не поддерживают?",
        "Что помогло бы тебе чувствовать, что ты действительно прогрессируешь?",
      ],
      tr: [
        "Son zamanlarda öğrendiğin ya da aldığın en büyük şey neydi?",
        "Öğrenmek ya da geliştirmek isteyip de fırsatını bulamadığın bir şey var mı?",
        "Yöneticin ya da ekibin büyümenini nasıl destekliyor — destekliyor mu?",
        "Gerçekten ilerlediğini hissetmene ne yardımcı olur?",
      ],
    },
    minTurns: 2,
    maxTurns: 5,
    coverageThreshold: 0.75,
  },
  {
    key: "D8",
    name: { en: "Purpose", ru: "Смысл", tr: "Amaç" },
    focus: {
      en: "Whether the work feels meaningful — connection to something bigger, personal values alignment, sense of impact.",
      ru: "Ощущает ли человек смысл в работе — связь с чем-то большим, соответствие личным ценностям, ощущение влияния.",
      tr: "İşin anlamlı hissettirip hissettirmediği — daha büyük bir şeyle bağlantı, kişisel değerlerle uyum, etki hissi.",
    },
    starterQuestions: {
      en: [
        "Does what you do at work feel like it matters — beyond just getting tasks done, does it connect to something bigger?",
        "Is there a part of your work that connects to something you actually care about or believe in?",
      ],
      ru: [
        "Ощущаешь ли ты, что твоя работа имеет значение — не просто выполнение задач, она связана с чем-то большим?",
        "Есть ли часть работы, которая связана с чем-то, что тебе действительно важно или во что ты веришь?",
      ],
      tr: [
        "Yaptığın işin önemli olduğunu hissediyor musun — sadece görevleri tamamlamanın ötesinde, daha büyük bir şeyle bağlantılı mı?",
        "İşinin gerçekten önem verdiğin ya da inandığın bir şeyle bağlantılı bir parçası var mı?",
      ],
    },
    probeQuestions: {
      en: [
        "What specifically makes it feel meaningful — or hollow? Give me an example.",
        "Has that sense of purpose or meaning changed since you started here?",
        "How much does your work align with your personal values or what you care about?",
        "Do you feel like your work makes a real difference — to customers, the team, the company?",
      ],
      ru: [
        "Что конкретно делает это значимым — или пустым? Приведи пример.",
        "Изменилось ли это ощущение смысла с тех пор, как ты здесь начал?",
        "Насколько твоя работа соответствует твоим личным ценностям или тому, что тебе важно?",
        "Чувствуешь ли ты, что твоя работа имеет реальное влияние — на клиентов, команду, компанию?",
      ],
      tr: [
        "Bunu anlamlı — ya da boş — hissettiren şey tam olarak nedir? Bir örnek ver.",
        "Bu amaç ya da anlam duygusu buraya başladığından beri değişti mi?",
        "İşin kişisel değerlerinle ya da önem verdiğin şeylerle ne kadar uyumlu?",
        "İşinin gerçek bir fark yarattığını hissediyor musun — müşteriler, ekip, şirket için?",
      ],
    },
    minTurns: 2,
    maxTurns: 5,
    coverageThreshold: 0.75,
  },
  {
    key: "D9",
    name: { en: "Obstacles", ru: "Препятствия", tr: "Engeller" },
    focus: {
      en: "What gets in the way — workload, processes, people, tools, bureaucracy, stress, energy drains.",
      ru: "Что мешает — нагрузка, процессы, люди, инструменты, бюрократия, стресс, энергетические потери.",
      tr: "Önüne ne çıkıyor — iş yükü, süreçler, insanlar, araçlar, bürokratik engeller, stres, enerji kaybı.",
    },
    starterQuestions: {
      en: [
        "What's the biggest thing that gets in the way of you doing your best work — the main frustration or blocker?",
        "Is there something that consistently slows you down, frustrates you, or drains your energy?",
      ],
      ru: [
        "Что больше всего мешает тебе делать работу на высшем уровне — главное разочарование или препятствие?",
        "Есть ли что-то, что постоянно тормозит тебя, раздражает или истощает твою энергию?",
      ],
      tr: [
        "En iyi işini yapmanın önüne geçen en büyük şey nedir — ana hayal kırıklığı ya da engel?",
        "Seni sürekli yavaşlatan, sinir eden ya da enerjini tüketip tüketen bir şey var mı?",
      ],
    },
    probeQuestions: {
      en: [
        "How long has that been an issue — is it new or ongoing?",
        "Have you tried to fix it or work around it — what happened?",
        "How much does it actually affect your day, your work quality, or your wellbeing?",
        "Is it something the team or company could change, or is it just how things are?",
      ],
      ru: [
        "Как давно это является проблемой — это новое или постоянное?",
        "Ты пытался это исправить или обойти — что произошло?",
        "Насколько это реально влияет на твой день, качество работы или твоё благополучие?",
        "Это что-то, что команда или компания могли бы изменить, или это просто так?",
      ],
      tr: [
        "Bu ne zamandır bir sorun — yeni mi yoksa devam eden mi?",
        "Bunu düzeltmeye ya da çalışmaya çalıştın mı — ne oldu?",
        "Bu günlük hayatını, çalışma kaliteni ya da refahını ne kadar etkiliyor?",
        "Ekibin ya da şirketin değiştirebileceği bir şey mi, yoksa sadece böyle mi?",
      ],
    },
    minTurns: 2,
    maxTurns: 5,
    coverageThreshold: 0.75,
  },
  {
    key: "D10",
    name: { en: "Voice", ru: "Голос", tr: "Ses" },
    focus: {
      en: "Whether the person feels heard — can they speak up, does it change anything, psychological safety, being valued.",
      ru: "Чувствует ли человек, что его слышат — может ли он высказаться, меняет ли это что-то, психологическая безопасность.",
      tr: "Kişinin duyulduğunu hissedip hissetmediği — sesini yükseltebiliyor mu, bir şeyi değiştiriyor mu, psikolojik güvenlik.",
    },
    starterQuestions: {
      en: [
        "When you have an idea, concern, or disagreement at work, do you feel like you can actually speak up?",
        "Has there been a time recently when you spoke up about something — what happened?",
      ],
      ru: [
        "Когда у тебя есть идея, беспокойство или разногласие на работе, чувствуешь ли ты, что можешь это сказать?",
        "Был ли недавно момент, когда ты высказался о чём-то — что произошло?",
      ],
      tr: [
        "İşte bir fikrin, endişen ya da anlaşmazlığın olduğunda, bunu gerçekten söyleyebildiğini hissediyor musun?",
        "Son zamanlarda bir konuda sesini yükselttiğin bir an oldu mu — ne oldu?",
      ],
    },
    probeQuestions: {
      en: [
        "What makes it feel safe — or unsafe — to speak up here?",
        "Did anything actually change because of what you said?",
        "Have you ever held back from saying something because you were worried about the reaction?",
        "Do you feel like your voice actually matters in decisions that affect you?",
      ],
      ru: [
        "Что делает высказывание безопасным — или опасным — здесь?",
        "Что-то реально изменилось из-за того, что ты сказал?",
        "Ты когда-нибудь удерживал себя от высказывания, потому что беспокоился о реакции?",
        "Чувствуешь ли ты, что твой голос действительно имеет значение в решениях, которые тебя касаются?",
      ],
      tr: [
        "Burada sesini yükseltmeyi güvenli — ya da güvensiz — hissettiren nedir?",
        "Söylediklerin yüzünden gerçekten bir şey değişti mi?",
        "Tepkisinden endişe duyduğun için hiç bir şey söylemekten kaçındın mı?",
        "Seni etkileyen kararlarda sesin gerçekten önemli olduğunu hissediyor musun?",
      ],
    },
    minTurns: 2,
    maxTurns: 5,
    coverageThreshold: 0.75,
  },
];

export const DIMENSION_ORDER: DimensionKey[] = DIMENSIONS.map((d) => d.key);

export function getDimension(key: DimensionKey): DimensionDef {
  return DIMENSIONS.find((d) => d.key === key)!;
}
