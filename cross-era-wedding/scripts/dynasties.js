// -*- coding: utf-8 -*-
/**
 * Cross-Era Wedding - Dynasty Configuration
 * ==========================================
 * Contains metadata and prompt templates for 13 Chinese dynasties/eras.
 * All image/video prompts are in English for optimal Agnes API performance.
 *
 * IMPORTANT: Prompts are kept concise to avoid Agnes content_policy_violation.
 * Each image prompt is ~200 chars, focusing on visual elements only.
 */

const DYNASTIES = [
  {
    id: "xia",
    name: "夏",
    eraTheme: "上古盟誓",
    eraYears: "c.2070–1600 BCE",
    storySummary: "黄河岸边的远古盟誓",
    costume: "玄色麻衣、粗布深衣、兽骨玉饰",
    scene: "河畔祭台、篝火、星空",
    customs: "对天盟誓、以水为证",
    colorPalette: "玄黑、土黄、暗红",
    imagePromptTemplate:
      "A Chinese man in dark hemp robe and a Chinese woman in red hemp dress, East Asian faces, Chinese features, " +
      "hold hands at a riverside altar with bonfires. Ancient tribal wedding, torchlight, starry sky. " +
      "Cinematic wide shot, warm firelight, dark earthy tones, photorealistic, 8K.",
    videoPromptTemplate:
      "Slow dolly in, riverside altar, bonfire glow, sparks rising, couple facing each other. " +
      "Wind lifts woman's hair ribbons, both share warm smiles, firelight on faces, volumetric light. " +
      "Crane up to starry sky. " +
      "Keep the same Chinese man and same Chinese woman throughout. Same faces, same clothing, no character changes. No objects appear or disappear. Cinematic film look, photorealistic, 8K.",
    portraitPromptMale:
      "A photorealistic cinematic portrait of an ancient Xia Dynasty tribal groom. " +
      "Keep the exact same facial features, face shape, eyes, nose, mouth and expression from the reference photo. " +
      "The man has long dark hair tied with simple cords, wearing dark hemp robe with jade pendant necklace and bone ornaments. " +
      "Standing by a riverside ritual altar with bonfire flames at golden dusk. " +
      "Warm firelight illuminates his face, earthy dark tones, shallow depth of field, 8K, cinematic color grading, film grain.",
    portraitPromptFemale:
      "A photorealistic cinematic portrait of an ancient Xia Dynasty tribal bride. " +
      "Keep the exact same facial features, face shape, eyes, nose, mouth and expression from the reference photo. " +
      "The woman has long dark hair adorned with shell and jade hair ornaments, wearing elegant hemp dress with simple beaded jewelry. " +
      "Standing by the Yellow River bank with reeds at golden hour. " +
      "Soft warm backlight, earthy tones, shallow depth of field, 8K, cinematic color grading, film grain."
  },
  {
    id: "xizhou",
    name: "西周",
    eraTheme: "礼乐婚典",
    eraYears: "1046–771 BCE",
    storySummary: "宗庙钟磬中的合卺之礼",
    costume: "玄纁之色、深衣礼服、礼乐佩玉",
    scene: "宗庙明堂、青铜礼器、编钟",
    customs: "六礼成婚、合卺交杯、黄昏迎亲",
    colorPalette: "玄黑、纁红、暗金",
    imagePromptTemplate:
      "A Chinese groom in black ceremonial robe and a Chinese bride in crimson dress, East Asian faces, Chinese features, " +
      "share a ritual cup in an ancestral temple with bronze bells. Royal Zhou Dynasty wedding, candlelight. " +
      "Cinematic medium shot, golden light, crimson and gold tones, photorealistic, 8K.",
    videoPromptTemplate:
      "Slow orbit in ancestral temple, golden candlelight, incense smoke in light rays, couple side by side. " +
      "Man turns toward woman, she smiles softly, candlelight on faces, silk sashes sway. " +
      "Tilt up to bronze bells, golden haze. " +
      "Keep the same Chinese man and same Chinese woman throughout. Same faces, same clothing, no character changes. No objects appear or disappear. Cinematic film look, photorealistic, 8K.",
    portraitPromptMale:
      "A photorealistic cinematic portrait of a Western Zhou Dynasty noble groom. " +
      "Keep the exact same facial features, face shape, eyes, nose, mouth and expression from the reference photo. " +
      "The man has traditional hair under a ceremonial black crown, wearing black shenyi robe with layered jade belt pendants. " +
      "Standing in an ancestral temple with ancient bronze bells. " +
      "Dramatic side lighting, crimson and gold tones, shallow depth of field, 8K, cinematic color grading, film grain.",
    portraitPromptFemale:
      "A photorealistic cinematic portrait of a Western Zhou Dynasty noble bride. " +
      "Keep the exact same facial features, face shape, eyes, nose, mouth and expression from the reference photo. " +
      "The woman has elaborate traditional updo with gold hairpins and jade ornaments, wearing red ceremonial xun robe with silk sashes. " +
      "Standing in a ritual hall with silk curtains and warm candles. " +
      "Soft dramatic lighting, crimson and jade tones, shallow depth of field, 8K, cinematic color grading, film grain."
  },
  {
    id: "warring",
    name: "战国",
    eraTheme: "剑客侠侣",
    eraYears: "475–221 BCE",
    storySummary: "千里奔袭，三年之约，终相拥",
    costume: "曲裾深衣、剑佩、束发冠",
    scene: "竹林亭榭、城楼烽火、桃花林",
    customs: "私奔出走、以剑为聘、生死相随",
    colorPalette: "墨绿、暗红、青铜色",
    imagePromptTemplate:
      "A Chinese man in dark leather armor over dark robe with a sword at his waist and a Chinese woman in dark crimson flowing shenyi, East Asian faces, Chinese features, " +
      "meeting at a pavilion by an ancient road at dusk. Distant mountains and beacon towers. Warm golden sunset light. " +
      "Cinematic wide shot, golden tones, photorealistic, 8K.",
    videoPromptTemplate:
      "Slow push in along ancient road toward a pavilion. Distant beacon fires flicker, golden sunset, thin mist. Two people stand a few steps apart. " +
      "0-2s: Slow push in, man walks slowly toward woman, dusty armor in sunset glow. 2-4s: They face each other, natural reserved warm smiles, eyes slightly moist, he extends his hand, she takes it. 4-5s: Slow pull back to wide ancient road, sun setting. " +
      "Keep the same Chinese man and same Chinese woman throughout. Same faces, same clothing, no character changes. No objects appear or disappear. Cinematic film look, photorealistic, 8K.",
    portraitPromptMale:
      "A photorealistic cinematic portrait of a Warring States era Chinese warrior. " +
      "Keep the exact same facial features, face shape, eyes, nose, mouth and expression from the reference photo. " +
      "The man has traditional long dark hair tied in a topknot with a simple jade hair crown. " +
      "Wearing dark leather armor over layered quju shenyi robes, a bronze sword at his waist. " +
      "Standing before a Great Wall beacon tower at dusk with smoke and signal fires in the distance. " +
      "Dramatic side-backlighting from the setting sun, dust particles in the air. " +
      "Shallow depth of field, 8K, cinematic color grading, film grain texture.",
    portraitPromptFemale:
      "A photorealistic cinematic portrait of a Warring States era Chinese noblewoman. " +
      "Keep the exact same facial features, face shape, eyes, nose, mouth and expression from the reference photo. " +
      "The woman has elaborate traditional Chinese updo hairstyle with gold hairpins and jade ornaments. " +
      "Wearing flowing dark crimson quju dress with layered silk skirts and intricate gold embroidery. " +
      "Standing on an ancient stone fortress wall with tattered battle flags waving behind. " +
      "Dramatic golden sunset backlight, wind blowing silk ribbons. " +
      "Shallow depth of field, 8K, cinematic color grading, film grain texture."
  },
  {
    id: "han",
    name: "汉",
    eraTheme: "汉风红妆",
    eraYears: "202 BCE–220 CE",
    storySummary: "未央宫中的结发同心",
    costume: "曲裾深衣、红衣嫁裳、步摇簪花",
    scene: "宫殿长廊、张灯结彩、百子帐",
    customs: "结发同心、奠雁为礼、红烛高照",
    colorPalette: "朱红、玄黑、鎏金",
    imagePromptTemplate:
      "A Chinese groom in red robe with gold trim and a Chinese bride in red dress with gold hairpins, East Asian faces, Chinese features, " +
      "in a palace corridor with red silk lanterns. Han Dynasty wedding, red candles, golden decorations. " +
      "Cinematic medium shot, warm candlelight, vermillion and gold tones, photorealistic, 8K.",
    videoPromptTemplate:
      "Slow tracking shot along palace corridor, red lanterns swaying, warm candlelight on gold, couple side by side. " +
      "They turn to face each other, hairpins catch light, both exchange warm smiles, shadows on robes. " +
      "Dolly out to wide palace gate, lanterns lining corridor. " +
      "Keep the same Chinese man and same Chinese woman throughout. Same faces, same clothing, no character changes. No objects appear or disappear. Cinematic film look, photorealistic, 8K.",
    portraitPromptMale:
      "A photorealistic cinematic portrait of a Han Dynasty noble groom. " +
      "Keep the exact same facial features, face shape, eyes, nose, mouth and expression from the reference photo. " +
      "The man has traditional hair under a black cap, wearing black quju robe with red trim and jade sword at waist. " +
      "Standing in Weiyang Palace corridor with red pillars and golden decorations. " +
      "Warm palace lighting, vermillion and gold tones, shallow depth of field, 8K, cinematic color grading, film grain.",
    portraitPromptFemale:
      "A photorealistic cinematic portrait of a Han Dynasty noble bride. " +
      "Keep the exact same facial features, face shape, eyes, nose, mouth and expression from the reference photo. " +
      "The woman has elegant updo with gold hair ornaments and jade hairpins, wearing stunning red quju dress with gold embroidery and wide silk sleeves. " +
      "Standing in a palace garden with blooming flowers and red lanterns. " +
      "Soft warm lighting, vermillion and gold tones, shallow depth of field, 8K, cinematic color grading, film grain."
  },
  {
    id: "jin",
    name: "晋",
    eraTheme: "魏晋风骨",
    eraYears: "265–420",
    storySummary: "竹林流水间的琴瑟之约",
    costume: "宽袖飘逸、褒衣博带、羽扇纶巾",
    scene: "兰亭曲水、竹林七贤、书斋抚琴",
    customs: "以文会友、琴瑟和鸣、兰亭序盟",
    colorPalette: "素白、竹青、淡墨",
    imagePromptTemplate:
      "A Chinese man in white wide-sleeve robe and a Chinese woman in white flowing dress, East Asian faces, Chinese features, " +
      "play guqin by a stream in bamboo grove. Jin Dynasty literati wedding, calligraphy scrolls, gentle breeze. " +
      "Cinematic wide shot, soft light, white and jade green tones, photorealistic, 8K.",
    videoPromptTemplate:
      "Slow drift beside stream in bamboo, misty soft light through canopy, couple sitting on rocks. " +
      "Breeze lifts their silk sleeves, both look at each other with serene expressions, leaves sway. " +
      "Crane up through bamboo canopy, misty wide forest and stream. " +
      "Keep the same Chinese man and same Chinese woman throughout. Same faces, same clothing, no character changes. No objects appear or disappear. Cinematic film look, photorealistic, 8K.",
    portraitPromptMale:
      "A photorealistic cinematic portrait of a Jin Dynasty scholar groom. " +
      "Keep the exact same facial features, face shape, eyes, nose, mouth and expression from the reference photo. " +
      "The man has long hair under a silk scarf and bamboo hat, wearing flowing wide-sleeve white robe with loose sashes. " +
      "Standing in a misty bamboo forest beside a flowing stream. " +
      "Soft diffused natural light, bamboo green and white tones, shallow depth of field, 8K, cinematic color grading, film grain.",
    portraitPromptFemale:
      "A photorealistic cinematic portrait of a Jin Dynasty elegant bride. " +
      "Keep the exact same facial features, face shape, eyes, nose, mouth and expression from the reference photo. " +
      "The woman has simple elegant updo with a single jade hairpin, wearing flowing white dress with wide silk sleeves. " +
      "Standing in an orchid garden beside a flowing stream. " +
      "Soft natural lighting, white and jade green tones, shallow depth of field, 8K, cinematic color grading, film grain."
  },
  {
    id: "nanbeichao",
    name: "南北朝",
    eraTheme: "丝路情缘",
    eraYears: "420–589",
    storySummary: "佛前石窟中的千年祈愿",
    costume: "胡汉融合、窄袖长袍、金饰璎珞",
    scene: "石窟佛寺、大漠孤烟、石窟壁画",
    customs: "佛堂结缘、跨族通婚、石窟祈愿",
    colorPalette: "土黄、石青、暗红",
    imagePromptTemplate:
      "A Chinese man in narrow-sleeve dark robe and a Chinese woman in red dress with gold embroidery, East Asian faces, Chinese features, " +
      "pray together in a Buddhist cave temple. Silk Road wedding, colorful murals, desert sunlight. " +
      "Cinematic wide shot, golden light, earthy and blue tones, photorealistic, 8K.",
    videoPromptTemplate:
      "Slow orbit at cave temple entrance, golden sunlight streaming, murals glowing, couple with palms together. " +
      "They lower hands and turn to each other, warm smiles, golden light on faces, lotus petals float. " +
      "Pull back to wide temple against desert mountains. " +
      "Keep the same Chinese man and same Chinese woman throughout. Same faces, same clothing, no character changes. No objects appear or disappear. Cinematic film look, photorealistic, 8K.",
    portraitPromptMale:
      "A photorealistic cinematic portrait of a Northern-Southern Dynasties noble groom. " +
      "Keep the exact same facial features, face shape, eyes, nose, mouth and expression from the reference photo. " +
      "The man has long hair under a silk headband, wearing flowing robe with wide sash and Buddhist prayer beads. " +
      "Standing in a Dunhuang cave temple with painted murals and golden Buddha. " +
      "Warm temple lighting, earthy blue and crimson tones, shallow depth of field, 8K, cinematic color grading, film grain.",
    portraitPromptFemale:
      "A photorealistic cinematic portrait of a Northern-Southern Dynasties graceful bride. " +
      "Keep the exact same facial features, face shape, eyes, nose, mouth and expression from the reference photo. " +
      "The woman has elaborate updo with celestial ribbon scarves and lotus hair ornament, wearing flowing dress with gold embroidery. " +
      "Standing in a Buddhist temple courtyard with blooming lotus pond. " +
      "Soft golden lighting, earthy blue and crimson tones, shallow depth of field, 8K, cinematic color grading, film grain."
  },
  {
    id: "tang",
    name: "唐",
    eraTheme: "大唐盛世",
    eraYears: "618–907",
    storySummary: "繁华长安，相识相知，许定终生",
    costume: "红男绿女、齐胸襦裙、幞头圆领",
    scene: "长安朱雀门、灯会、牡丹园、胡旋舞",
    customs: "却扇礼、合髻、催妆诗、交杯酒",
    colorPalette: "大红、翠绿、明金",
    imagePromptTemplate:
      "A Chinese man in black futou hat and red robe and a Chinese woman in green qixiong ruqun, East Asian faces, Chinese features, " +
      "facing each other in a magnificent Tang palace garden. Peonies in bloom, red lanterns hanging, gold ornaments gleaming. " +
      "Cinematic wide shot, warm light through flowers, red and gold tones, photorealistic, 8K.",
    videoPromptTemplate:
      "Slow push in through magnificent Tang palace garden. Peony petals drifting down, warm lantern light. Two people facing each other. " +
      "0-2s: Slow push in, they gaze quietly at each other, natural gentle smiles, eyes full of tenderness. 2-4s: Man nods gently as if making a promise, she nods slightly in return, petals falling around them. 4-5s: Slow pull back to wide palace garden panorama, lanterns and golden pillars. " +
      "Keep the same Chinese man and same Chinese woman throughout. Same faces, same clothing, no character changes. No objects appear or disappear. Cinematic film look, photorealistic, 8K.",
    portraitPromptMale:
      "A Tang Dynasty groom portrait, wearing black futou hat and red robe with gold dragon embroidery, " +
      "grand palace background with red lanterns, photorealistic, cinematic lighting, 8K.",
    portraitPromptFemale:
      "A Tang Dynasty bride portrait, wearing green qixiong ruqun with gold phoenix ornaments and elaborate hairpins, " +
      "grand palace background with peonies, photorealistic, cinematic lighting, 8K."
  },
  {
    id: "song",
    name: "宋",
    eraTheme: "宋韵清雅",
    eraYears: "960–1279",
    storySummary: "汴河桥上的温婉之缘",
    costume: "淡青/浅红褙子、凤冠霞帔雏形、珍珠妆",
    scene: "汴河虹桥、园林水榭、灯笼街市",
    customs: "奠雁、交拜、牵巾、撒帐",
    colorPalette: "淡粉、天青、素白",
    imagePromptTemplate:
      "A Chinese groom in light blue robe and a Chinese bride in pink dress with pearls, East Asian faces, Chinese features, " +
      "in a waterside garden pavilion with stone bridge. Song Dynasty wedding, red lanterns, soft twilight. " +
      "Cinematic medium shot, soft light, pink and sky blue tones, photorealistic, 8K.",
    videoPromptTemplate:
      "Slow drift across stone bridge, soft twilight, water reflecting pink sky, couple facing each other. " +
      "Evening breeze lifts pearl ornaments, both exchange serene smiles, water ripples, lotuses sway. " +
      "Pull back to wide garden pavilion with lanterns at dusk. " +
      "Keep the same Chinese man and same Chinese woman throughout. Same faces, same clothing, no character changes. No objects appear or disappear. Cinematic film look, photorealistic, 8K.",
    portraitPromptMale:
      "A Song Dynasty groom portrait, wearing light blue ruqun robe with jade belt, " +
      "waterside garden pavilion background, photorealistic, soft natural lighting, 8K.",
    portraitPromptFemale:
      "A Song Dynasty bride portrait, wearing delicate pink beizi dress with pearl ornaments, " +
      "waterside garden with stone bridge background, photorealistic, soft twilight lighting, 8K."
  },
  {
    id: "yuan",
    name: "元",
    eraTheme: "草原盟约",
    eraYears: "1271–1368",
    storySummary: "草原星空下的敖包之约",
    costume: "质孙服、罟罟冠、蒙古长袍",
    scene: "蒙古包、草原落日、敖包、马背",
    customs: "敖包相会、以马为聘、篝火歌舞",
    colorPalette: "草原绿、落日橙、靛蓝",
    imagePromptTemplate:
      "A Chinese man in blue Mongol robe and a Chinese woman in red dress with silver headdress, East Asian faces, Chinese features, " +
      "stand by an ovoo cairn on grassland. Yuan Dynasty wedding, yurt camp, bonfire, golden sunset. " +
      "Cinematic wide shot, golden sunset, green and orange tones, photorealistic, 8K.",
    videoPromptTemplate:
      "Slow tracking across vast grassland, golden sunset, grass swaying, yurts in distance, couple before ovoo. " +
      "Wind catches silver headdress ornaments, both turn to each other with warm smiles, vast sky. " +
      "Crane up to wide grassland panorama with snow mountains. " +
      "Keep the same Chinese man and same Chinese woman throughout. Same faces, same clothing, no character changes. No objects appear or disappear. Cinematic film look, photorealistic, 8K.",
    portraitPromptMale:
      "A photorealistic cinematic portrait of a Yuan Dynasty Mongol groom. " +
      "Keep the exact same facial features, face shape, eyes, nose, mouth and expression from the reference photo. " +
      "The man has traditional Mongol hairstyle, wearing blue del robe with leather belt and fur trim. " +
      "Standing on vast Mongolian grassland with yurts and horses at golden sunset. " +
      "Dramatic sunset backlight, grassland green and orange tones, shallow depth of field, 8K, cinematic color grading, film grain.",
    portraitPromptFemale:
      "A photorealistic cinematic portrait of a Yuan Dynasty Mongol bride. " +
      "Keep the exact same facial features, face shape, eyes, nose, mouth and expression from the reference photo. " +
      "The woman wears an elaborate boqta headdress with silver ornaments, wearing red del dress with intricate embroidery. " +
      "Standing on vast grassland with wildflowers and distant mountains at sunset. " +
      "Warm golden lighting, grassland green and orange tones, shallow depth of field, 8K, cinematic color grading, film grain."
  },
  {
    id: "ming",
    name: "明",
    eraTheme: "凤冠霞帔",
    eraYears: "1368–1644",
    storySummary: "大明湖畔，桥头相遇，私定终身",
    costume: "真红大袖衫、凤冠霞帔、绣花鞋、盖头",
    scene: "紫禁城、祠堂、红绸高挂、花轿",
    customs: "三拜九叩、挑盖头、喝交杯酒、结发",
    colorPalette: "正红、明黄、金绣",
    imagePromptTemplate:
      "A Chinese man in blue robe with black hat and a Chinese woman in pink dress with delicate hairpins, East Asian faces, Chinese features, " +
      "meeting on a beautiful stone bridge. Lake reflects weeping willows, distant pavilions and towers. Soft afternoon light, water shimmer. " +
      "Cinematic wide shot, soft green and pink tones, photorealistic, 8K.",
    videoPromptTemplate:
      "Slow push in toward a beautiful stone bridge over Daming Lake. Weeping willows sway gently, lake reflects green, soft afternoon light. Two people facing each other on the bridge. " +
      "0-2s: Slow push in, their eyes meet, natural reserved smiles, lake breeze gently lifts their hair. 2-4s: Man leans slightly forward as if whispering a promise, woman lowers her head with a shy smile. 4-5s: Slow pull back to wide lake panorama, stone bridge, willows, distant pavilions. " +
      "Keep the same Chinese man and same Chinese woman throughout. Same faces, same clothing, no character changes. No objects appear or disappear. Cinematic film look, photorealistic, 8K.",
    portraitPromptMale:
      "A Ming Dynasty groom portrait, wearing red robe with gold embroidery and black hat, " +
      "grand courtyard with red lanterns background, photorealistic, warm candlelight, 8K.",
    portraitPromptFemale:
      "A Ming Dynasty bride portrait, wearing phoenix crown xiapei in red and gold dress with veil, " +
      "grand courtyard background, photorealistic, warm candlelight, 8K."
  },
  {
    id: "qing",
    name: "清",
    eraTheme: "满汉合璧",
    eraYears: "1644–1912",
    storySummary: "江南水乡的满汉情深",
    costume: "旗袍、马褂、坎肩、花盆底鞋、朝珠",
    scene: "四合院、园林、红墙黄瓦、喜堂",
    customs: "跨火盆、掀盖头、坐帐、子孙饽饽",
    colorPalette: "绛红、藏青、鎏金",
    imagePromptTemplate:
      "A Chinese groom in dark blue changpao and a Chinese bride in red qipao with headdress, East Asian faces, Chinese features, " +
      "in a traditional courtyard with red walls. Qing Dynasty wedding, fire basin, red lanterns. " +
      "Cinematic medium shot, warm indoor light, crimson and gold tones, photorealistic, 8K.",
    videoPromptTemplate:
      "Slow push-in through courtyard hall, red walls, golden fire basin glow, warm candlelight, couple before altar. " +
      "Candlelight flickers on faces, both turn to each other with tender smiles, incense smoke rises. " +
      "Pull back to wide courtyard with red walls and silk banners. " +
      "Keep the same Chinese man and same Chinese woman throughout. Same faces, same clothing, no character changes. No objects appear or disappear. Cinematic film look, photorealistic, 8K.",
    portraitPromptMale:
      "A photorealistic cinematic portrait of a Qing Dynasty noble groom. " +
      "Keep the exact same facial features, face shape, eyes, nose, mouth and expression from the reference photo. " +
      "The man has traditional queue hairstyle, wearing dark blue changpao robe with mandarin square badge and court beads necklace. " +
      "Standing in a Summer Palace corridor with painted ceiling and red pillars. " +
      "Warm palace lighting, crimson and indigo tones, shallow depth of field, 8K, cinematic color grading, film grain.",
    portraitPromptFemale:
      "A photorealistic cinematic portrait of a Qing Dynasty Manchu bride. " +
      "Keep the exact same facial features, face shape, eyes, nose, mouth and expression from the reference photo. " +
      "The woman wears elaborate Manchu headdress with flower ornaments, wearing red qipao-style dress with gold embroidery and flowerpot shoes. " +
      "Standing in a Jiangnan water town with willows and traditional boats. " +
      "Soft golden lighting, crimson and indigo tones, shallow depth of field, 8K, cinematic color grading, film grain."
  },
  {
    id: "minguo",
    name: "民国",
    eraTheme: "十里洋场",
    eraYears: "1912–1949",
    storySummary: "十里洋场的摩登之约",
    costume: "新娘：旗袍/白纱/蕾丝头纱；新郎：长衫/双排扣西装",
    scene: "上海外滩、石库门、黄包车、留声机",
    customs: "文明结婚、交换戒指、教堂/礼堂、抛捧花",
    colorPalette: "sepia褐色调、米白、藏青",
    imagePromptTemplate:
      "A Chinese man in dark double-breasted suit and a Chinese woman in white lace dress with veil, East Asian faces, Chinese features, " +
      "on the 1930s Shanghai Bund. Republic era wedding, vintage buildings, soft sepia lighting. " +
      "Cinematic wide shot, sepia tones, cream and navy, photorealistic, 8K.",
    videoPromptTemplate:
      "Slow tracking along Bund promenade, art deco buildings, sepia-toned light, wet street reflecting neon, couple facing each other. " +
      "Confetti drifting down, both share warm joyful smiles, vintage lamplight on faces, gentle breeze. " +
      "Pull back to wide Bund skyline at dusk. " +
      "Keep the same Chinese man and same Chinese woman throughout. Same faces, same clothing, no character changes. No objects appear or disappear. Cinematic film look, photorealistic, 8K.",
    portraitPromptMale:
      "A photorealistic cinematic portrait of a Republic of China era groom. " +
      "Keep the exact same facial features, face shape, eyes, nose, mouth and expression from the reference photo. " +
      "The man has slicked-back vintage hairstyle, wearing elegant dark double-breasted suit with vest and pocket watch. " +
      "Standing on old Shanghai Bund with art deco buildings at night. " +
      "Dramatic neon lighting, sepia and navy tones, shallow depth of field, 8K, cinematic color grading, film grain.",
    portraitPromptFemale:
      "A photorealistic cinematic portrait of a Republic of China era bride. " +
      "Keep the exact same facial features, face shape, eyes, nose, mouth and expression from the reference photo. " +
      "The woman has vintage waved hairstyle under a lace veil, wearing elegant white Western-style wedding dress with pearls. " +
      "Standing in a vintage Shanghai ballroom with crystal chandelier. " +
      "Warm golden lighting, cream and champagne tones, shallow depth of field, 8K, cinematic color grading, film grain."
  },
  {
    id: "modern",
    name: "现代",
    eraTheme: "永恒誓言",
    eraYears: "1949–Present",
    storySummary: "婚礼殿堂，十指紧扣，奔赴未来",
    costume: "白纱/中式秀禾、西装/中山装",
    scene: "教堂、海边、草坪、城市夜景、气球",
    customs: "交换戒指、拥吻、抛捧花、无人机灯光",
    colorPalette: "纯白、香槟金、天蓝",
    imagePromptTemplate:
      "A Chinese man in white suit and a Chinese woman in white wedding gown with veil, East Asian faces, Chinese features, " +
      "facing each other inside a seaside chapel. Glass walls let in golden sunset, ocean sparkling. White rose petals along the aisle. " +
      "Cinematic wide shot, warm romantic light, lens flare, white and gold tones, photorealistic, 8K.",
    videoPromptTemplate:
      "Slow push in toward a beautiful seaside chapel. Golden sunset through glass walls, soft lens flare, ocean shimmering. Two people facing each other. " +
      "0-2s: Slow push in, natural reserved smiles, gentle eye contact. 2-4s: Man slowly extends his hand, woman places her hand in his, fingers interlocking, golden backlight silhouettes them. 4-5s: Slow crane up to aerial view of chapel on cliff above the sea. " +
      "Keep the same Chinese man and same Chinese woman throughout. Same faces, same clothing, no character changes. No objects appear or disappear. Cinematic film look, photorealistic, 8K.",
    portraitPromptMale:
      "A modern groom portrait, wearing elegant black tuxedo with bow tie, " +
      "seaside chapel at golden sunset background, photorealistic, cinematic lighting, 8K.",
    portraitPromptFemale:
      "A modern bride portrait, wearing magnificent white wedding gown with veil, " +
      "seaside chapel at golden sunset background, photorealistic, cinematic lighting, 8K."
  }
];

module.exports = { DYNASTIES };
