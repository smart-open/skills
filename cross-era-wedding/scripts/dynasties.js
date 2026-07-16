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
    costume: "玄色麻衣、粗布深衣、兽骨玉饰",
    scene: "河畔祭台、篝火、星空",
    customs: "对天盟誓、以水为证",
    colorPalette: "玄黑、土黄、暗红",
    imagePromptTemplate:
      "A cinematic ancient Chinese tribal wedding at twilight by a riverside altar with bonfires. " +
      "A young couple in dark hemp robes with jade ornaments hold hands facing the starry sky. " +
      "Mystical torchlight, river reflection, ancient totem poles. " +
      "Cinematic wide shot, warm firelight, dark and earthy tones, photorealistic, 8K.",
    videoPromptTemplate:
      "Flickering bonfire flames, falling sparks rising, subtle camera drift, " +
      "romantic mystical atmosphere, cinematic film look."
  },
  {
    id: "xizhou",
    name: "西周",
    eraTheme: "礼乐婚典",
    costume: "玄纁之色、深衣礼服、礼乐佩玉",
    scene: "宗庙明堂、青铜礼器、编钟",
    customs: "六礼成婚、合卺交杯、黄昏迎亲",
    colorPalette: "玄黑、纁红、暗金",
    imagePromptTemplate:
      "A grand cinematic ancient Chinese royal wedding inside an ancestral temple with bronze bells. " +
      "The couple in black and crimson ceremonial robes with jade pendants share a ritual cup. " +
      "Bronze vessels and warm candlelight illuminate the sacred hall. " +
      "Cinematic medium shot, golden light, crimson and gold tones, photorealistic, 8K.",
    videoPromptTemplate:
      "Slow ceremonial movements, candle flames flickering, incense smoke drifting, " +
      "subtle camera push-in, solemn romantic atmosphere, cinematic film look."
  },
  {
    id: "warring",
    name: "战国",
    eraTheme: "剑客侠侣",
    costume: "曲裾深衣、剑佩、束发冠",
    scene: "竹林亭榭、城楼烽火、桃花林",
    customs: "私奔出走、以剑为聘、生死相随",
    colorPalette: "墨绿、暗红、青铜色",
    imagePromptTemplate:
      "A cinematic ancient Chinese couple in dark flowing robes standing in a bamboo forest pavilion. " +
      "The man has a sword at his waist. Falling peach blossoms swirl around them. " +
      "A distant watchtower and beacon fire on the horizon. " +
      "Cinematic wide shot, dappled sunlight, ink green and bronze tones, photorealistic, 8K.",
    videoPromptTemplate:
      "Slow motion falling peach blossoms, bamboo leaves swaying, " +
      "the couple slowly turning to face each other, subtle camera orbit, " +
      "epic romantic atmosphere, cinematic film look."
  },
  {
    id: "han",
    name: "汉",
    eraTheme: "汉风红妆",
    costume: "曲裾深衣、红衣嫁裳、步摇簪花",
    scene: "宫殿长廊、张灯结彩、百子帐",
    customs: "结发同心、奠雁为礼、红烛高照",
    colorPalette: "朱红、玄黑、鎏金",
    imagePromptTemplate:
      "A magnificent cinematic Chinese Han Dynasty wedding in a palace corridor with red silk lanterns. " +
      "The groom in red robe with gold patterns, the bride in stunning red dress with gold hair ornaments. " +
      "Red candles and golden decorations fill the grand hall. " +
      "Cinematic medium shot, warm candlelight, vermillion and gold tones, photorealistic, 8K.",
    videoPromptTemplate:
      "Candle flames flickering, red lanterns swaying softly, " +
      "subtle camera slow zoom, warm romantic atmosphere, cinematic film look."
  },
  {
    id: "jin",
    name: "晋",
    eraTheme: "魏晋风骨",
    costume: "宽袖飘逸、褒衣博带、羽扇纶巾",
    scene: "兰亭曲水、竹林七贤、书斋抚琴",
    customs: "以文会友、琴瑟和鸣、兰亭序盟",
    colorPalette: "素白、竹青、淡墨",
    imagePromptTemplate:
      "An elegant cinematic ancient Chinese literati couple by a winding stream in a bamboo grove. " +
      "They wear flowing white wide-sleeve robes playing a guqin zither together. " +
      "Calligraphy scrolls on a stone table, bamboo leaves in gentle breeze. " +
      "Cinematic wide shot, soft natural light, white and jade green tones, photorealistic, 8K.",
    videoPromptTemplate:
      "Bamboo leaves swaying, fingers playing guqin strings, " +
      "flowing silk sleeves, subtle camera drift, " +
      "elegant poetic atmosphere, cinematic film look."
  },
  {
    id: "nanbeichao",
    name: "南北朝",
    eraTheme: "丝路情缘",
    costume: "胡汉融合、窄袖长袍、金饰璎珞",
    scene: "石窟佛寺、大漠孤烟、石窟壁画",
    customs: "佛堂结缘、跨族通婚、石窟祈愿",
    colorPalette: "土黄、石青、暗红",
    imagePromptTemplate:
      "A cinematic ancient Chinese Silk Road wedding inside a Buddhist cave temple. " +
      "The couple in narrow-sleeve fusion robes with gold belts and jewelry pray together. " +
      "Colorful murals and a giant Buddha statue, desert sunlight streaming through the cave entrance. " +
      "Cinematic wide shot, golden desert light, earthy and blue tones, photorealistic, 8K.",
    videoPromptTemplate:
      "Dust particles dancing in golden light rays, prayer hands touching, " +
      "colorful murals glowing, subtle camera slow push, " +
      "sacred romantic atmosphere, cinematic film look."
  },
  {
    id: "tang",
    name: "唐",
    eraTheme: "大唐盛世",
    costume: "红男绿女、齐胸襦裙、幞头圆领",
    scene: "长安朱雀门、灯会、牡丹园、胡旋舞",
    customs: "却扇礼、合髻、催妆诗、交杯酒",
    colorPalette: "大红、翠绿、明金",
    imagePromptTemplate:
      "A magnificent cinematic Chinese Tang Dynasty couple in traditional wedding attire standing in a grand palace. " +
      "The groom in black hat and red robe with gold embroidery, the bride in green dress with gold ornaments. " +
      "Red and gold decorations, peonies, and hanging lanterns fill the scene. " +
      "Cinematic wide shot, warm lantern glow, red and gold palette, photorealistic, 8K.",
    videoPromptTemplate:
      "Spinning lanterns creating light trails, falling peony petals, " +
      "subtle camera orbit, grand festive atmosphere, cinematic film look.",
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
    costume: "淡青/浅红褙子、凤冠霞帔雏形、珍珠妆",
    scene: "汴河虹桥、园林水榭、灯笼街市",
    customs: "奠雁、交拜、牵巾、撒帐",
    colorPalette: "淡粉、天青、素白",
    imagePromptTemplate:
      "An elegant cinematic Chinese Song Dynasty wedding in a waterside garden pavilion. " +
      "The groom in light blue robe, the bride in delicate pink dress with pearl ornaments. " +
      "A stone bridge spans the river behind, red lanterns under soft twilight. " +
      "Cinematic medium shot, soft twilight, pink and sky blue tones, photorealistic, 8K.",
    videoPromptTemplate:
      "Red silk ribbon flowing between hands, river shimmering, " +
      "lanterns swaying in evening breeze, subtle camera slow zoom, " +
      "elegant tender atmosphere, cinematic film look.",
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
    costume: "质孙服、罟罟冠、蒙古长袍",
    scene: "蒙古包、草原落日、敖包、马背",
    customs: "敖包相会、以马为聘、篝火歌舞",
    colorPalette: "草原绿、落日橙、靛蓝",
    imagePromptTemplate:
      "A cinematic Mongolian grassland wedding at golden sunset. " +
      "The couple in traditional Mongolian robes stand beside an ovoo stone cairn with prayer flags. " +
      "A yurt camp glows with bonfire light against the vast grassland. " +
      "Cinematic wide shot, golden sunset, green and orange tones, photorealistic, 8K.",
    videoPromptTemplate:
      "Prayer flags fluttering, horse mane blowing, " +
      "the couple reaching hands toward each other, bonfire sparks rising, " +
      "subtle camera drift, epic romantic atmosphere, cinematic film look."
  },
  {
    id: "ming",
    name: "明",
    eraTheme: "凤冠霞帔",
    costume: "真红大袖衫、凤冠霞帔、绣花鞋、盖头",
    scene: "紫禁城、祠堂、红绸高挂、花轿",
    customs: "三拜九叩、挑盖头、喝交杯酒、结发",
    colorPalette: "正红、明黄、金绣",
    imagePromptTemplate:
      "A cinematic Chinese Ming Dynasty couple in elaborate red and gold wedding attire standing in a grand traditional courtyard. " +
      "Red lanterns, golden decorations, warm candlelight. " +
      "Cinematic wide shot, true red and gold tones, photorealistic, 8K.",
    videoPromptTemplate:
      "Red silk veils gently lifting, gold embroidery shimmering in candlelight, " +
      "tender expressions revealed, subtle camera push-in, " +
      "grand romantic atmosphere, cinematic film look.",
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
    costume: "旗袍、马褂、坎肩、花盆底鞋、朝珠",
    scene: "四合院、园林、红墙黄瓦、喜堂",
    customs: "跨火盆、掀盖头、坐帐、子孙饽饽",
    colorPalette: "绛红、藏青、鎏金",
    imagePromptTemplate:
      "A cinematic Chinese Qing Dynasty wedding in a traditional courtyard with red walls and golden tiles. " +
      "The groom in dark blue jacket with court beads, the bride in red embroidered dress. " +
      "Decorated wedding hall with fire basin and red lanterns. " +
      "Cinematic medium shot, warm indoor lighting, crimson and gold tones, photorealistic, 8K.",
    videoPromptTemplate:
      "Fire basin flames flickering, red lanterns swaying, silk curtains flowing, " +
      "subtle camera drift, warm festive atmosphere, cinematic film look."
  },
  {
    id: "minguo",
    name: "民国",
    eraTheme: "十里洋场",
    costume: "新娘：旗袍/白纱/蕾丝头纱；新郎：长衫/双排扣西装",
    scene: "上海外滩、石库门、黄包车、留声机",
    customs: "文明结婚、交换戒指、教堂/礼堂、抛捧花",
    colorPalette: "sepia褐色调、米白、藏青",
    imagePromptTemplate:
      "A cinematic 1930s Chinese wedding on the Shanghai Bund waterfront. " +
      "The groom in a dark double-breasted suit, the bride in white lace dress with veil. " +
      "Vintage buildings and a gramophone in the background. " +
      "Cinematic wide shot, soft sepia-toned lighting, cream and navy tones, photorealistic, 8K.",
    videoPromptTemplate:
      "Lace veil flowing in breeze, hands exchanging rings, " +
      "gramophone spinning, subtle camera slow zoom, " +
      "nostalgic romantic atmosphere, cinematic film look."
  },
  {
    id: "modern",
    name: "现代",
    eraTheme: "永恒誓言",
    costume: "白纱/中式秀禾、西装/中山装",
    scene: "教堂、海边、草坪、城市夜景、气球",
    customs: "交换戒指、拥吻、抛捧花、无人机灯光",
    colorPalette: "纯白、香槟金、天蓝",
    imagePromptTemplate:
      "A cinematic modern wedding at a beautiful seaside chapel during golden sunset. " +
      "The groom in an elegant black tuxedo, the bride in a magnificent white wedding gown. " +
      "They embrace as the sun sets over the ocean with floating balloons in the sky. " +
      "Cinematic wide shot, golden sunset light, white and champagne gold tones, photorealistic, 8K.",
    videoPromptTemplate:
      "Slow motion embrace, wedding veil flowing in sea breeze, " +
      "sky lanterns rising, waves gently crashing, " +
      "subtle camera orbit, magical romantic atmosphere, cinematic film look.",
    portraitPromptMale:
      "A modern groom portrait, wearing elegant black tuxedo with bow tie, " +
      "seaside chapel at golden sunset background, photorealistic, cinematic lighting, 8K.",
    portraitPromptFemale:
      "A modern bride portrait, wearing magnificent white wedding gown with veil, " +
      "seaside chapel at golden sunset background, photorealistic, cinematic lighting, 8K."
  }
];

module.exports = { DYNASTIES };
