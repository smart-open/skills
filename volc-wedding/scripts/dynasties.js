// -*- coding: utf-8 -*-
/**
 * Dynasty Configurations for Volc Wedding Skill
 * =============================================
 * 13 Chinese dynasties with cinematic prompts for Seedream + Seedance.
 * Each dynasty is a "micro-script" with time-segmented video descriptions.
 *
 * Prompt language: English (optimal for Seedream/Seedance)
 * Display labels: Chinese
 */

const DYNASTIES = [
  {
    id: "xia",
    name: "夏",
    eraTheme: "华夏初光",
    eraYears: "c.2070–1600 BCE",
    costume: "麻布素衣、兽皮披风、玉饰",
    scene: "黄河岸边、祭坛、篝火、青铜初现",
    customs: "祭祀天地、部落盟誓、火种传承",
    colorPalette: "土黄、深褐、青铜绿",
    portraitPromptMale:
      "A photorealistic portrait of an ancient Xia Dynasty tribal leader, " +
      "wearing simple hemp robe with jade pendant necklace. " +
      "Bonfire and ritual altar background at dusk. " +
      "Cinematic lighting, shallow depth of field, 8K, highly detailed facial features.",
    portraitPromptFemale:
      "A photorealistic portrait of an ancient Xia Dynasty noblewoman, " +
      "wearing elegant hemp dress with shell and jade ornaments in her hair. " +
      "Yellow River bank with reeds at golden hour. " +
      "Soft cinematic lighting, shallow depth of field, 8K, highly detailed facial features.",
    couplePrompt:
      "A cinematic wide shot of an ancient Xia Dynasty couple standing together by the Yellow River at sunset. " +
      "The man in simple hemp robe with jade pendant, the woman in elegant dress with shell ornaments. " +
      "A sacred bronze ritual vessel between them, bonfire flames dancing. " +
      "Warm golden sunset light, earth tones and bronze palette, photorealistic, 8K, epic composition.",
    videoPrompt:
      "0–2s: Slow push-in. The couple stands by the river at sunset, holding hands. " +
      "Golden light reflects on the water surface. Camera slowly pushes toward them. " +
      "2–5s: Medium shot. They turn to face each other, the man gently places a jade pendant around the woman's neck. " +
      "Her eyes fill with tender emotion. Bonfire sparks drift upward in the background. " +
      "5–8s: Wide shot. They raise their joined hands toward the sky as the sun sets. " +
      "Camera slowly pulls back revealing the vast river and sacred altar. Epic grand atmosphere. " +
      "Cinematic film look, warm golden grading, shallow depth of field.",
    firstFramePrompt:
      "Ancient Xia Dynasty couple by Yellow River at sunset, bronze ritual vessel, bonfire, warm golden light",
    lastFramePrompt:
      "The couple's silhouettes against the setting sun, hands raised to sky, vast river landscape",
    videoSettings: { ratio: "16:9", duration: 8, camera: "push-in then pull-back" }
  },
  {
    id: "xizhou",
    name: "西周",
    eraTheme: "礼乐天下",
    eraYears: "1046–771 BCE",
    costume: "深衣、冕冠、玉组佩",
    scene: "宗庙、礼乐殿堂、青铜礼器",
    customs: "周礼婚制、纳采问名、合卺礼",
    colorPalette: "玄黑、纁红、玉白",
    portraitPromptMale:
      "A photorealistic portrait of a Western Zhou Dynasty noble groom, " +
      "wearing black shenyi robe with jade belt and ceremonial crown. " +
      "Ancestral temple background with bronze bells. " +
      "Dramatic side lighting, shallow depth of field, 8K, highly detailed facial features.",
    portraitPromptFemale:
      "A photorealistic portrait of a Western Zhou Dynasty noble bride, " +
      "wearing red xun robe with layered jade pendants and elaborate hairpins. " +
      "Ritual hall with silk curtains background. " +
      "Soft dramatic lighting, shallow depth of field, 8K, highly detailed facial features.",
    couplePrompt:
      "A cinematic wide shot of a Western Zhou Dynasty noble wedding couple in a grand ancestral temple. " +
      "The groom in black shenyi with jade crown, the bride in red ceremonial dress with layered jade ornaments. " +
      "Ancient bronze bells and ritual vessels surround them. Silk curtains drift gently. " +
      "Dramatic temple lighting, black and crimson palette, photorealistic, 8K, majestic composition.",
    videoPrompt:
      "0–2s: Slow orbit shot. The couple stands before bronze bells in the temple. " +
      "Incense smoke drifts through beams of light. Camera orbits slowly around them. " +
      "2–5s: Medium close-up. They perform the hejin ritual, sharing a gourd cup. " +
      "Their eyes meet with deep reverence. Bronze bells chime softly in background. " +
      "5–8s: Wide crane shot. Camera rises upward showing the full temple hall. " +
      "The couple bows together before the ancestral tablets. Sunlight streams through windows. " +
      "Cinematic film look, dramatic chiaroscuro lighting, majestic atmosphere.",
    firstFramePrompt:
      "Western Zhou couple in ancestral temple, bronze bells, incense smoke, dramatic light beams",
    lastFramePrompt:
      "Couple bowing before ancestral tablets, sunlight streaming through temple windows, crane shot",
    videoSettings: { ratio: "16:9", duration: 8, camera: "orbit then crane-up" }
  },
  {
    id: "warring",
    name: "战国",
    eraTheme: "烽火佳人",
    eraYears: "475–221 BCE",
    storySummary: "烽火连天下的重逢之誓",
    costume: "男子束发戴冠、曲裾深衣配皮甲腰剑；女子高髻云鬟、暗红曲裾长裙配金玉步摇",
    scene: "长城烽火台、古战场硝烟、残阳如血",
    customs: "战地重逢、烽火为证、生死相托",
    colorPalette: "铁灰、暗红、残阳金",
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
      "Shallow depth of field, 8K, cinematic color grading, film grain texture.",
    couplePrompt:
      "A cinematic epic wide shot of a Warring States Chinese couple reunited on the Great Wall at sunset. " +
      "The warrior man in leather armor with long hair tied in topknot, the woman in flowing dark crimson dress with elaborate updo. " +
      "Smoke rises from distant beacon towers, battle flags wave in the wind, dust fills the golden air. " +
      "The man gently holds the woman's face with both hands after years of separation. " +
      "Dramatic golden hour backlight, iron grey and crimson palette, volumetric light rays through dust. " +
      "Photorealistic, 8K, anamorphic lens flare, epic war-romance composition.",
    videoPrompt:
      "0–2s: Slow dolly-in tracking shot. The warrior man walks through swirling battlefield dust toward the woman waiting on the Great Wall parapet. " +
      "His armor catches the golden sunset light. Her dark crimson dress flows in the wind. Tattered battle flags wave violently. " +
      "2–5s: Medium close-up on faces. They stop inches apart. He gently lifts her chin with a gauntleted hand. " +
      "Tears glisten on her cheeks. Distant beacon fires flare orange against the darkening sky. Dust particles dance in golden backlight. " +
      "5–8s: Extreme wide aerial pull-back. The couple embraces as the camera rises high above, revealing the winding Great Wall stretching across mountains. " +
      "Signal fires burn along the entire length. The sky explodes in crimson and gold. Epic heartbreaking beauty. " +
      "Cinematic film look, anamorphic lens, volumetric dust light, war-romance color grading, film grain.",
    firstFramePrompt:
      "Warring States warrior walking through dust toward woman on Great Wall, battle flags, golden sunset",
    lastFramePrompt:
      "Couple embracing, aerial view of Great Wall stretching across mountains, signal fires, crimson sky",
    videoSettings: { ratio: "16:9", duration: 8, camera: "dolly-in then aerial pull-back" }
  },
  {
    id: "han",
    name: "汉",
    eraTheme: "大汉雄风",
    eraYears: "202 BCE–220 CE",
    costume: "曲裾袍、直裾、玉具剑",
    scene: "未央宫、丝绸之路、大漠孤烟",
    customs: "六礼成婚、合卺交杯、结发同心",
    colorPalette: "玄黑、朱红、金绣",
    portraitPromptMale:
      "A photorealistic portrait of a Han Dynasty noble groom, " +
      "wearing black quju robe with red trim and jade sword at waist. " +
      "Weiyang Palace corridor with red pillars background. " +
      "Warm palace lighting, shallow depth of field, 8K, highly detailed facial features.",
    portraitPromptFemale:
      "A photorealistic portrait of a Han Dynasty noble bride, " +
      "wearing red quju dress with gold embroidery and jade hair ornaments. " +
      "Palace garden with blooming flowers background. " +
      "Soft warm lighting, shallow depth of field, 8K, highly detailed facial features.",
    couplePrompt:
      "A cinematic wide shot of a Han Dynasty wedding couple in the magnificent Weiyang Palace. " +
      "The groom in black robe with red trim and jade sword, the bride in red dress with gold embroidery. " +
      "Red pillars and golden decorations fill the grand hall. Silk Road treasures displayed. " +
      "Warm golden palace light, black and crimson palette, photorealistic, 8K, majestic composition.",
    videoPrompt:
      "0–2s: Slow push-in. The couple stands in the palace hall surrounded by red pillars. " +
      "Golden decorations shimmer in warm light. Camera pushes in slowly. " +
      "2–5s: Medium shot. They perform the hejin ritual with an elaborate bronze cup. " +
      "Close-up on their hands intertwined around the cup. Tender eye contact. " +
      "5–8s: Wide shot. Camera orbits around them as they walk together toward the palace gate. " +
      "Desert landscape visible through the gate, Silk Road caravans in distance. Epic scope. " +
      "Cinematic film look, warm golden grading, majestic palace atmosphere.",
    firstFramePrompt:
      "Han Dynasty couple in Weiyang Palace, red pillars, golden decorations, warm light",
    lastFramePrompt:
      "Couple walking toward palace gate, desert landscape and Silk Road visible, epic scope",
    videoSettings: { ratio: "16:9", duration: 8, camera: "push-in then orbit" }
  },
  {
    id: "jin",
    name: "晋",
    eraTheme: "魏晋风流",
    eraYears: "265–420",
    costume: "宽袖长衫、纶巾、木屐",
    scene: "竹林、兰亭、曲水流觞",
    customs: "曲水流觞、竹林雅集、琴瑟和鸣",
    colorPalette: "竹青、素白、墨黑",
    portraitPromptMale:
      "A photorealistic portrait of a Jin Dynasty scholar groom, " +
      "wearing flowing wide-sleeve robe with silk scarf and bamboo hat. " +
      "Bamboo forest with mist background. " +
      "Soft diffused lighting, shallow depth of field, 8K, highly detailed facial features.",
    portraitPromptFemale:
      "A photorealistic portrait of a Jin Dynasty elegant bride, " +
      "wearing white flowing dress with simple jade hairpin. " +
      "Orchid garden beside a flowing stream background. " +
      "Soft natural lighting, shallow depth of field, 8K, highly detailed facial features.",
    couplePrompt:
      "A cinematic wide shot of a Jin Dynasty couple in a misty bamboo forest beside a flowing stream. " +
      "The scholar groom in flowing wide-sleeve robe, the bride in white dress with jade hairpin. " +
      "Bamboo stalks sway gently, orchids bloom by the water. " +
      "Soft misty morning light, bamboo green and white palette, photorealistic, 8K, poetic composition.",
    videoPrompt:
      "0–2s: Slow tracking shot. The couple walks along a stone path by the stream in the bamboo forest. " +
      "Mist drifts between bamboo stalks. Water flows gently over stones. " +
      "2–5s: Medium shot. They sit together by the stream, he plays a guqin, she listens with closed eyes. " +
      "Orchid petals float on the water surface. Serene and intimate moment. " +
      "5–8s: Wide shot. Camera slowly pulls up through bamboo canopy. " +
      "The couple becomes small in the vast misty forest. Sunlight filters through leaves. " +
      "Cinematic film look, soft misty grading, poetic Zen atmosphere.",
    firstFramePrompt:
      "Jin Dynasty couple in misty bamboo forest by stream, orchids, soft morning light",
    lastFramePrompt:
      "Aerial view through bamboo canopy, couple small in vast misty forest, sunlight filtering",
    videoSettings: { ratio: "16:9", duration: 8, camera: "tracking then crane-up" }
  },
  {
    id: "nanbeichao",
    name: "南北朝",
    eraTheme: "乱世情缘",
    eraYears: "420–589",
    costume: "褒衣博带、鲜卑服饰、飞天飘带",
    scene: "敦煌石窟、佛寺、大漠",
    customs: "佛前盟誓、莲花灯、转经祈福",
    colorPalette: "石青、赭红、金箔",
    portraitPromptMale:
      "A photorealistic portrait of a Northern-Southern Dynasties noble groom, " +
      "wearing flowing robe with wide sash and Buddhist prayer beads. " +
      "Dunhuang cave temple with painted murals background. " +
      "Warm temple lighting, shallow depth of field, 8K, highly detailed facial features.",
    portraitPromptFemale:
      "A photorealistic portrait of a Northern-Southern Dynasties graceful bride, " +
      "wearing flowing dress with celestial ribbon scarves and lotus hair ornament. " +
      "Buddhist temple courtyard with blooming lotus pond background. " +
      "Soft golden lighting, shallow depth of field, 8K, highly detailed facial features.",
    couplePrompt:
      "A cinematic wide shot of a Northern-Southern Dynasties couple in a Buddhist temple courtyard. " +
      "The groom in flowing robe with prayer beads, the bride with celestial ribbons and lotus ornament. " +
      "Lotus pond with blooming flowers, temple bells, painted murals on walls. " +
      "Warm golden temple light, lapis and crimson palette, photorealistic, 8K, spiritual composition.",
    videoPrompt:
      "0–2s: Slow orbit. The couple stands before a lotus pond in the temple courtyard. " +
      "Lotus flowers bloom around them. Temple bells chime softly. " +
      "2–5s: Medium shot. They light a lotus lantern together, hands touching. " +
      "Warm golden light reflects on the pond surface. Murals glow in background. " +
      "5–8s: Wide shot. Camera pulls back showing the full temple complex against desert mountains. " +
      "The couple's lantern rises into the twilight sky. Spiritual and epic atmosphere. " +
      "Cinematic film look, warm golden grading, spiritual serenity.",
    firstFramePrompt:
      "Northern-Southern Dynasties couple in Buddhist temple courtyard, lotus pond, temple bells",
    lastFramePrompt:
      "Temple complex against desert mountains, lotus lantern rising into twilight sky",
    videoSettings: { ratio: "16:9", duration: 8, camera: "orbit then pull-back" }
  },
  {
    id: "tang",
    name: "唐",
    eraTheme: "大唐盛世",
    eraYears: "618–907",
    storySummary: "长安灯火下的千年之约",
    costume: "男子幞头束发、圆领绯红袍配玉带；女子高髻花钗、齐胸翠绿襦裙配金钿",
    scene: "长安朱雀门、牡丹花海、华灯初上",
    customs: "却扇礼、交杯合卺、花前月下",
    colorPalette: "朱红、翠绿、明金、暖烛黄",
    portraitPromptMale:
      "A photorealistic cinematic portrait of a Tang Dynasty Chinese nobleman. " +
      "Keep the exact same facial features, face shape, eyes, nose, mouth and expression from the reference photo. " +
      "The man has traditional dark hair neatly styled under a black futou hat with two wing-like extensions. " +
      "Wearing a magnificent crimson red round-collar robe with intricate golden dragon embroidery, jade belt with hanging ornaments. " +
      "Standing in a grand Tang palace hall with hundreds of glowing red lanterns. " +
      "Warm golden candlelight illuminates his face, dramatic chiaroscuro lighting. " +
      "Shallow depth of field, 8K, cinematic color grading, film grain texture.",
    portraitPromptFemale:
      "A photorealistic cinematic portrait of a Tang Dynasty Chinese noblewoman. " +
      "Keep the exact same facial features, face shape, eyes, nose, mouth and expression from the reference photo. " +
      "The woman has an elaborate Tang Dynasty high bun hairstyle adorned with golden phoenix hairpins, pearl strands and flower ornaments. " +
      "Wearing a stunning jade-green qixiong ruqun with wide silk sleeves, golden phoenix embroidery and layered pearl necklaces. " +
      "Standing in a lush peony garden with palace architecture and red lanterns. " +
      "Warm soft lighting from hundreds of lanterns, bokeh of red lights in background. " +
      "Shallow depth of field, 8K, cinematic color grading, film grain texture.",
    couplePrompt:
      "A cinematic epic wide shot of a Tang Dynasty Chinese couple in the magnificent Chang'an palace at night. " +
      "The man in crimson robe with golden dragon embroidery and black futou hat, the woman in jade-green qixiong ruqun with elaborate high bun and phoenix crown. " +
      "Hundreds of red lanterns glow around them, peonies bloom in golden vases, candle flames flicker on marble floors. " +
      "The man gently lifts the woman's red silk veil, revealing her shy smile. " +
      "Warm golden lantern light, crimson and jade green palette, volumetric light from candles. " +
      "Photorealistic, 8K, anamorphic lens flare, grand festive composition.",
    videoPrompt:
      "0–2s: Slow intimate push-in. The man gently lifts the woman's red silk veil with both hands. Her face is revealed beneath the phoenix crown, a shy tearful smile. Golden candlelight flickers across both faces, casting dancing shadows on palace pillars. Falling peony petals drift through golden light beams. " +
      "2–5s: Medium close-up two-shot. They share the jiao-bei wedding cup, arms intertwined in an elegant figure-eight. Their eyes lock with deep emotion. Close-up on their hands around the ornate golden cup. Warm candle bokeh fills the background. Intimate and tender atmosphere. " +
      "5–8s: Wide majestic orbit shot. They turn together toward the massive palace window. Magnificent fireworks burst across the night sky over Chang'an city. The camera slowly orbits around them, revealing the grand palace hall with hundreds of lanterns reflected on polished marble. Epic grand romantic finale. " +
      "Cinematic film look, anamorphic lens, warm golden lantern grading, shallow depth of field, film grain.",
    firstFramePrompt:
      "Tang Dynasty man lifting woman's red veil in palace, phoenix crown, candlelight, peonies",
    lastFramePrompt:
      "Tang couple by palace window with fireworks over Chang'an, hundreds of lanterns, orbit shot",
    videoSettings: { ratio: "16:9", duration: 8, camera: "push-in then orbit" }
  },
  {
    id: "song",
    name: "宋",
    eraTheme: "宋韵清雅",
    eraYears: "960–1279",
    costume: "淡青/浅红褙子、凤冠霞帔雏形、珍珠妆",
    scene: "汴河虹桥、园林水榭、灯笼街市",
    customs: "奠雁、交拜、牵巾、撒帐",
    colorPalette: "淡粉、天青、素白",
    portraitPromptMale:
      "A photorealistic portrait of a Song Dynasty scholar groom, " +
      "wearing light blue ruqun robe with jade belt and scholar's cap. " +
      "Waterside garden pavilion with willow trees background. " +
      "Soft natural lighting, shallow depth of field, 8K, highly detailed facial features.",
    portraitPromptFemale:
      "A photorealistic portrait of a Song Dynasty elegant bride, " +
      "wearing delicate pink beizi dress with pearl ornaments and simple hairpins. " +
      "Stone bridge over a serene pond with lotus flowers background. " +
      "Soft twilight lighting, shallow depth of field, 8K, highly detailed facial features.",
    couplePrompt:
      "A cinematic wide shot of a Song Dynasty wedding couple in an elegant waterside garden pavilion. " +
      "The groom in light blue robe, the bride in delicate pink dress with pearl ornaments. " +
      "A stone bridge spans the river behind, red lanterns under soft twilight. " +
      "Soft twilight light, pink and sky blue tones, photorealistic, 8K, elegant tender composition.",
    videoPrompt:
      "0–2s: Slow zoom-in. The couple stands on a stone bridge over a serene river at twilight. " +
      "Red silk ribbon flows between their hands. Willow branches sway gently. " +
      "2–5s: Medium shot. They face each other and bow in the traditional jiao-bai ritual. " +
      "River shimmers with reflected lantern light. Tender emotional moment. " +
      "5–8s: Wide shot. Camera slowly pulls back showing the full garden pavilion scene. " +
      "Lanterns sway in evening breeze, petals float on the water. Elegant romantic atmosphere. " +
      "Cinematic film look, soft twilight grading, elegant and tender mood.",
    firstFramePrompt:
      "Song Dynasty couple on stone bridge at twilight, red silk ribbon, willow branches",
    lastFramePrompt:
      "Garden pavilion at dusk, lanterns swaying, petals on water, romantic atmosphere",
    videoSettings: { ratio: "16:9", duration: 8, camera: "zoom-in then pull-back" }
  },
  {
    id: "yuan",
    name: "元",
    eraTheme: "草原雄鹰",
    eraYears: "1271–1368",
    costume: "质孙服、姑姑冠、皮袍",
    scene: "蒙古草原、毡帐、马群、星空",
    customs: "草原婚俗、敖包相会、赛马迎亲",
    colorPalette: "草原绿、天空蓝、篝火橙",
    portraitPromptMale:
      "A photorealistic portrait of a Yuan Dynasty Mongol groom, " +
      "wearing traditional blue del robe with leather belt and fur trim. " +
      "Mongolian grassland with yurts and horses background at sunset. " +
      "Dramatic sunset lighting, shallow depth of field, 8K, highly detailed facial features.",
    portraitPromptFemale:
      "A photorealistic portrait of a Yuan Dynasty Mongol bride, " +
      "wearing red del dress with elaborate boqta headdress and silver ornaments. " +
      "Grassland with wildflowers and distant mountains background. " +
      "Warm sunset lighting, shallow depth of field, 8K, highly detailed facial features.",
    couplePrompt:
      "A cinematic wide shot of a Yuan Dynasty Mongol couple on the vast grassland at sunset. " +
      "The groom in blue robe with fur trim, the bride in red dress with elaborate headdress. " +
      "Mongolian yurts dot the landscape, horses graze nearby, bonfires burn in distance. " +
      "Dramatic sunset light, grassland green and sky blue palette, photorealistic, 8K, epic nomadic composition.",
    videoPrompt:
      "0–2s: Tracking shot. The couple rides together across the grassland at sunset. " +
      "Her dress and his cape flow in the wind. Horses gallop beside them. " +
      "2–5s: Medium shot. They dismount and face each other beside a sacred ovoo stone pile. " +
      "He presents her with a ceremonial blue scarf. Tender moment with vast sky behind. " +
      "5–8s: Wide shot. Camera pulls back showing the couple against the vast grassland. " +
      "The Milky Way appears above as twilight deepens. Epic and romantic atmosphere. " +
      "Cinematic film look, dramatic sunset-to-starry-sky grading, epic nomadic romance.",
    firstFramePrompt:
      "Yuan Dynasty couple riding across grassland at sunset, horses, flowing capes",
    lastFramePrompt:
      "Couple against vast grassland under Milky Way, epic starry sky, twilight deepening",
    videoSettings: { ratio: "16:9", duration: 8, camera: "tracking then pull-back" }
  },
  {
    id: "ming",
    name: "明",
    eraTheme: "凤冠霞帔",
    eraYears: "1368–1644",
    storySummary: "紫禁城中的凤冠之约",
    costume: "男子乌纱帽束发、大红圆领袍配玉带；女子凤冠霞帔、真红大袖衫配绣花鞋",
    scene: "紫禁城大婚殿堂、红绸高悬、龙凤花烛",
    customs: "挑盖头、交杯合卺、结发同心",
    colorPalette: "正红、明黄、金绣、暖烛橙",
    portraitPromptMale:
      "A photorealistic cinematic portrait of a Ming Dynasty Chinese nobleman. " +
      "Keep the exact same facial features, face shape, eyes, nose, mouth and expression from the reference photo. " +
      "The man has traditional dark hair neatly styled under a black wusha official hat with winged sides. " +
      "Wearing a magnificent true-red round-collar robe with intricate golden dragon and cloud embroidery, jade belt with jade pendants. " +
      "Standing in a grand Forbidden City wedding hall with red silk curtains and golden screens. " +
      "Warm candlelight illuminates his face, dramatic chiaroscuro from dragon-phoenix candles. " +
      "Shallow depth of field, 8K, cinematic color grading, film grain texture.",
    portraitPromptFemale:
      "A photorealistic cinematic portrait of a Ming Dynasty Chinese bride. " +
      "Keep the exact same facial features, face shape, eyes, nose, mouth and expression from the reference photo. " +
      "The woman wears the iconic Ming Dynasty phoenix crown xiapei — an elaborate golden phoenix headdress with dangling pearl strands and ruby ornaments, plus a red silk veil partially covering her face. " +
      "Wearing a magnificent true-red daxiu robe with golden phoenix embroidery and wide flowing sleeves. " +
      "Standing in the Forbidden City wedding hall with red silk decorations and golden candle stands. " +
      "Warm golden candlelight, red silk reflections on her face. " +
      "Shallow depth of field, 8K, cinematic color grading, film grain texture.",
    couplePrompt:
      "A cinematic epic wide shot of a Ming Dynasty Chinese couple in the grand Forbidden City wedding hall. " +
      "The man in true-red robe with golden dragon embroidery and black wusha hat, the woman in phoenix crown xiapei with red veil and true-red daxiu robe. " +
      "Massive dragon-phoenix wedding candles burn on both sides, red silk drapes from the ceiling, golden screens reflect candlelight. " +
      "The man reaches out to gently lift her red veil. " +
      "Warm golden candle glow, true red and gold palette, volumetric smoke from incense burners. " +
      "Photorealistic, 8K, anamorphic lens flare, grand ceremonial composition.",
    videoPrompt:
      "0–2s: Slow dramatic push-in. The man reaches forward with both hands and gently lifts the woman's red silk veil. Her face is revealed beneath the magnificent phoenix crown, eyes glistening with emotion. Massive dragon-phoenix candles flicker on both sides, casting dancing golden light on palace pillars. Incense smoke drifts through beams of warm light. " +
      "2–5s: Medium close-up two-shot. They hold the jiao-bei cup together and drink, arms intertwined in the traditional figure-eight. Close-up on the golden embroidery of their robes shimmering in candlelight. Tender emotional expressions, tears of joy on her cheeks. Intimate and sacred atmosphere. " +
      "5–8s: Wide majestic pull-back. They turn and walk together through the grand hall as camera slowly pulls back, revealing the entire Forbidden City wedding scene. Hundreds of red lanterns and golden decorations. Fireworks burst above the traditional yellow-tiled rooftops visible through the palace gate. Epic ceremonial romantic finale. " +
      "Cinematic film look, anamorphic lens, warm golden candle grading, shallow depth of field, film grain.",
    firstFramePrompt:
      "Ming Dynasty man lifting woman's red veil in Forbidden City, phoenix crown, dragon-phoenix candles",
    lastFramePrompt:
      "Ming couple walking through grand hall, fireworks above yellow rooftops, pull-back shot",
    videoSettings: { ratio: "16:9", duration: 8, camera: "push-in then pull-back" }
  },
  {
    id: "qing",
    name: "清",
    eraTheme: "满汉情深",
    eraYears: "1644–1912",
    costume: "旗装、长袍马褂、花盆底鞋、朝珠",
    scene: "颐和园、紫禁城、江南水乡",
    customs: "跨火盆、掀盖头、坐帐、合卺",
    colorPalette: "绛紫、宝蓝、金线",
    portraitPromptMale:
      "A photorealistic portrait of a Qing Dynasty noble groom, " +
      "wearing dark blue changpao robe with mandarin square badge and court beads. " +
      "Summer Palace corridor with painted ceiling background. " +
      "Warm palace lighting, shallow depth of field, 8K, highly detailed facial features.",
    portraitPromptFemale:
      "A photorealistic portrait of a Qing Dynasty Manchu bride, " +
      "wearing red qipao-style dress with elaborate headdress and flowerpot shoes. " +
      "Jiangnan water town with willows and boats background. " +
      "Soft golden lighting, shallow depth of field, 8K, highly detailed facial features.",
    couplePrompt:
      "A cinematic wide shot of a Qing Dynasty couple in a Jiangnan water town at dusk. " +
      "The groom in dark blue robe with court beads, the bride in red dress with elaborate headdress. " +
      "Stone bridges, willow trees, and traditional boats on the canal. Lanterns begin to light. " +
      "Soft twilight light, crimson and indigo palette, photorealistic, 8K, romantic water-town composition.",
    videoPrompt:
      "0–2s: Slow tracking shot. The couple walks along a canal-side stone path at dusk. " +
      "Willow branches brush the water surface. Traditional boats float by. " +
      "2–5s: Medium shot. They stop on a stone bridge, he presents her with a jade pendant. " +
      "Lanterns reflect in the canal water. Tender romantic moment. " +
      "5–8s: Wide shot. Camera slowly rises showing the full water town at night. " +
      "Thousands of lanterns illuminate the canals. The couple stands on the bridge as centerpiece. " +
      "Cinematic film look, twilight-to-night grading, romantic water-town atmosphere.",
    firstFramePrompt:
      "Qing Dynasty couple walking by canal at dusk, willows, traditional boats, lanterns",
    lastFramePrompt:
      "Aerial view of water town at night, thousands of lanterns, couple on stone bridge",
    videoSettings: { ratio: "16:9", duration: 8, camera: "tracking then crane-up" }
  },
  {
    id: "minguo",
    name: "民国",
    eraTheme: "十里洋场",
    eraYears: "1912–1949",
    costume: "旗袍、长衫、西装、婚纱",
    scene: "上海外滩、老式电车、百乐门",
    customs: "新式婚礼、交换戒指、舞会",
    colorPalette: "墨绿、酒红、香槟金",
    portraitPromptMale:
      "A photorealistic portrait of a Republic of China era groom, " +
      "wearing elegant dark suit with vest and pocket watch. " +
      "Old Shanghai Bund with art deco buildings background at night. " +
      "Dramatic neon lighting, shallow depth of field, 8K, highly detailed facial features.",
    portraitPromptFemale:
      "A photorealistic portrait of a Republic of China era bride, " +
      "wearing elegant white Western-style wedding dress with veil and pearls. " +
      "Vintage Shanghai ballroom with crystal chandelier background. " +
      "Warm golden lighting, shallow depth of field, 8K, highly detailed facial features.",
    couplePrompt:
      "A cinematic wide shot of a Republic of China era couple on the Shanghai Bund at night. " +
      "The groom in elegant dark suit, the bride in white wedding dress with veil. " +
      "Art deco buildings line the waterfront, vintage cars pass by, neon signs glow. " +
      "Dramatic neon and warm light, jade green and champagne palette, photorealistic, 8K, glamorous composition.",
    videoPrompt:
      "0–2s: Tracking shot. The couple walks along the Bund promenade at night. " +
      "Vintage cars pass behind them. Neon signs reflect on the Huangpu River. " +
      "2–5s: Medium shot. They stop and face each other, he presents a ring. " +
      "Close-up on the ring exchange. Crystal chandelier reflections in background. " +
      "5–8s: Wide shot. Camera pulls back showing the full Bund skyline. " +
      "They embrace as fireworks burst above the art deco buildings. Glamorous romantic finale. " +
      "Cinematic film look, dramatic neon grading, glamorous 1930s atmosphere.",
    firstFramePrompt:
      "Republic era couple on Shanghai Bund at night, vintage cars, neon signs, river reflections",
    lastFramePrompt:
      "Couple embracing with Bund skyline and fireworks, art deco buildings, glamorous finale",
    videoSettings: { ratio: "16:9", duration: 8, camera: "tracking then pull-back" }
  },
  {
    id: "modern",
    name: "现代",
    eraTheme: "永恒誓言",
    eraYears: "1949–Present",
    storySummary: "山海之间的永恒承诺",
    costume: "男子黑色西装三件套配领结；女子白色拖尾婚纱配长头纱",
    scene: "海边悬崖玻璃教堂、落日余晖、漫天孔明灯",
    customs: "交换戒指、拥吻誓言、放飞孔明灯",
    colorPalette: "纯白、香槟金、落日橙、海蓝",
    portraitPromptMale:
      "A photorealistic cinematic portrait of a modern Chinese groom. " +
      "Keep the exact same facial features, face shape, eyes, nose, mouth and expression from the reference photo. " +
      "The man wears an elegant tailored black three-piece suit with a crisp white shirt and black bow tie. " +
      "Modern clean hairstyle, confident and warm expression. " +
      "Standing in a stunning modern glass chapel on a seaside cliff at golden sunset. " +
      "Golden hour light streams through glass walls, ocean visible behind. " +
      "Shallow depth of field, 8K, cinematic color grading, film grain texture.",
    portraitPromptFemale:
      "A photorealistic cinematic portrait of a modern Chinese bride. " +
      "Keep the exact same facial features, face shape, eyes, nose, mouth and expression from the reference photo. " +
      "The woman wears a magnificent white mermaid wedding gown with a long flowing cathedral veil and delicate pearl jewelry. " +
      "Elegant modern bridal hairstyle with soft waves and a crystal hairpin. " +
      "Standing in the glass seaside chapel with golden sunset backlight creating a radiant halo through her veil. " +
      "Ocean waves visible through the glass behind her. " +
      "Shallow depth of field, 8K, cinematic color grading, film grain texture.",
    couplePrompt:
      "A cinematic epic wide shot of a modern Chinese couple in a stunning glass chapel on a seaside cliff at golden sunset. " +
      "The man in elegant black three-piece suit, the woman in magnificent white mermaid gown with long cathedral veil. " +
      "Golden sunset light streams through the glass walls creating a cathedral of light, ocean waves crash below the cliff. " +
      "They stand facing each other at the chapel altar, about to exchange rings. " +
      "Golden sunset light, white and champagne gold palette, lens flare from the setting sun. " +
      "Photorealistic, 8K, anamorphic lens flare, romantic epic composition.",
    videoPrompt:
      "0–2s: Slow intimate dolly-in. The couple stands at the glass chapel altar facing each other, golden sunset light streaming through floor-to-ceiling glass walls. Her long cathedral veil catches the wind and flows like silk. His eyes are filled with emotion. The ocean sparkles golden behind them. " +
      "2–5s: Medium close-up two-shot. He gently takes her hand and slides the wedding ring onto her finger. She looks up at him with tears of joy. They lean in for a gentle kiss. Behind them, dozens of sky lanterns begin to rise into the twilight sky. Intimate and deeply emotional atmosphere. " +
      "5–8s: Extreme wide aerial pull-back. Camera pulls back through the glass chapel revealing the stunning coastal landscape — the chapel perched on a cliff, the ocean stretching to the horizon, and hundreds of sky lanterns floating upward into the deepening blue sky. The sun dips below the horizon painting everything in gold and rose. Epic romantic finale. " +
      "Cinematic film look, anamorphic lens, golden hour grading, shallow depth of field, film grain.",
    firstFramePrompt:
      "Modern couple at glass seaside chapel altar, golden sunset through glass, veil flowing, ocean",
    lastFramePrompt:
      "Couple kissing in glass chapel, aerial view of cliff and ocean, hundreds of sky lanterns rising",
    videoSettings: { ratio: "16:9", duration: 8, camera: "dolly-in then aerial pull-back" }
  }
];

module.exports = { DYNASTIES };
