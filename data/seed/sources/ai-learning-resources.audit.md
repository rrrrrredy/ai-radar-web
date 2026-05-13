# AI Learning Resources Import Audit

Generated: 2026-05-13

## Counts

- Total rows/entries parsed: 272
- Total cleaned sources: 270
- Total skipped or audit-only rows: 0
- Total private/internal/credentialed/image links removed: 76
- Total image links removed: 62
- Total requiring public URL: 40

## By Category

| Category | Count |
| --- | ---: |
| ai_specific | 9 |
| book | 20 |
| domestic_media | 55 |
| other | 10 |
| overseas_media | 10 |
| podcast | 26 |
| research_blog | 4 |
| vc_blog | 6 |
| vc_partner | 7 |
| video_course | 16 |
| x_account | 107 |

## By Type

| Type | Count |
| --- | ---: |
| ai_media | 29 |
| book | 20 |
| course | 14 |
| investor | 15 |
| newsletter | 15 |
| other | 7 |
| podcast | 26 |
| researcher | 6 |
| tech_media | 29 |
| x_account | 107 |
| youtube | 2 |

## By Tier

| Tier | Count |
| --- | ---: |
| T1.5 | 92 |
| T2 | 128 |
| T3 | 1 |
| unreviewed | 49 |

## By Crawl Method

| Crawl method | Count |
| --- | ---: |
| html | 47 |
| manual | 56 |
| no_crawl | 19 |
| podcast_feed | 1 |
| unknown | 40 |
| x_api_future | 107 |

## Deduplication Notes

- SemiAnalysis: merged line 300 into line 102.
- A16Z Podcast: merged line 377 into line 242.

## Parsing Limitations

- Markdown tables with unescaped cell separators are repaired only when the expected column count is clear.
- QR/image-only contact cells are intentionally removed and converted into manual URL-completion work.
- RSS feeds are recorded only when the input explicitly contains a public feed link.
- Platform pages that require future APIs or manual handling are kept but not treated as ready ingestion feeds.

## High-priority manual URL completion

- 机器之心 (domestic_media, ai_media) - 老牌AI技术媒体，内容偏前沿、硬核，内容涵盖AI行业大部分信息。
- AI好好用 (domestic_media, ai_media) - 机器之心旗下媒体子品牌，内容聚焦AI产品的应用案例，内容风格大众化。
- 新智元 (domestic_media, ai_media) - 老牌AI技术媒体，内容涵盖AI行业大部分信息，内容风格处于技术硬核和大众化之间，但较为标题党。
- 量子位 (domestic_media, ai_media) - 晚于机器之心和新智元成立的AI媒体，内容涵盖AI行业大部分信息，内容风格大众化，但部分内容偶尔出现错误，且商务合作文章较多，标题夸张。
- 晚点LatePost (domestic_media, tech_media) - 原《财经》团队创办的综合类媒体，文章内容不限于AI，但近年来关注AI话题较多，尤其是AI领域的代表性人物专访，文章质量较高。
- 极客公园 (domestic_media, tech_media) - 老牌科技媒体，文章内容不限于AI，但近年来大部分内容都聚焦于AI，文章风格较为大众化。
- Founder Park (domestic_media, tech_media) - 极客公园旗下媒体子品牌，依托于其旗下企业家社区产品，内容以人物访谈和海外文章翻译搬运为主。
- 雷峰网 (domestic_media, tech_media) - 老牌科技媒体，文章内容不限于AI，会以类似杂志封面系列报道的形式不定期发布行业深度报道文章，此类文章质量较高。
- AI科技评论 (domestic_media, ai_media) - 雷峰网旗下媒体子品牌，专注AI方向的报道，内容偏硬核技术和产业。
- 海外独角兽 (domestic_media, investor) - 拾象旗下的内容品牌，得益于拾象投资机构的视角和海外资源，在技术和产品方向上有不少专业、深度的文章。但需要注意的是，由于拾象本身有投资业务，部分文章内容存在为其投资方向背书的目的，需要甄别。
- 智能涌现 (domestic_media, ai_media) - 36氪旗下的媒体子品牌，专注报道AI，内容上以人物专访、行业动态和独家信息为主，内容质量一般、行业影响力和团队投入度不及其他几家老牌AI媒体，但会不时发布行业独家信息（频率不高）。
- 新皮层NewNewThing (domestic_media, ai_media) - 《第一财经》旗下媒体子品牌，关注科技大方向，AI方向的内容占比较高，经常有行业独家信息，内容质量尚可。
- AI那点事 (domestic_media, ai_media) - 个人号，古早行业内幕与八卦，部分文章已被和谐。
- Web3天空之城 (domestic_media, ai_media) - 以搬运国内外AI领域代表人物的访谈为主。
- 硅星GenAI (domestic_media, ai_media) - 老牌科技媒体Pingwest品玩旗下媒体子品牌，专注AI方向的报道，文章内容较为大众化，偏行业信息。
- 硅星人Pro (domestic_media, ai_media) - 老牌科技媒体Pingwest品玩旗下媒体子品牌，专注AI方向的报道，文章内容较为大众化，偏行业信息。
- 硅基立场 (domestic_media, ai_media) - 老牌科技媒体Pingwest品玩旗下媒体子品牌，主要由其创始人撰写AI方向的评论，更新频率不高，内容质量尚可。
- APPSO (domestic_media, ai_media) - 老牌科技媒体爱范儿旗下媒体子品牌，专注AI报道，聚焦产品和行业资讯，内容风格大众化。
- 腾讯科技 (domestic_media, ai_media) - 老牌门户科技媒体，关注综合科技方向，今年来AI方向的内容日渐增多，内容质量尚可。
- AMiner AI (domestic_media, tech_media) - 有智谱“血缘”的科技信息产品AMiner旗下公众号，以技术论文和技术动态为主，内容质量较高。
- 机器学习研究组订阅 (domestic_media, tech_media) - 百度七剑客雷鸣创办的公众号，主要搬运技术新闻。
- 未尽研究 (domestic_media, tech_media) - 内容涵盖AI、新能源、合成生物和地缘政治，以报告向和评论向文章为主，经常输出技术+政策向文章内容。
- DeeplearningAI (domestic_media, tech_media) - 吴恩达的人工智能教育平台。
- PaperWeekly (domestic_media, investor) - 机器之心投资的媒体品牌，主要关注NLP方向，尤其是前沿论文。
- ADFeed (domestic_media, ai_media) - 综合信息类AI媒体，内容方向以技术为主，近期较多涉及多模态方向。
- Z Potentials (domestic_media, ai_media) - 新晋AI类媒体，主要关注产品方向和业界动态，内容风格大众化。
- 亲爱的数据 (domestic_media, ai_media) - 通俗易懂地讲解技术原理，适合技术小白。
- 特工宇宙 (domestic_media, ai_media) - 专注AI Agent的科技媒体。
- AI产品榜 (domestic_media, tech_media) - 国内关注度最高的AI榜单产品，可定期关注不同AI产品的DAU、MAU及下载排名等信息。
- 夕小瑶科技说 (domestic_media, ai_media) - 弱化版“量子位”，内容风格更为大众化，适合技术小白。

## Likely first ingestion candidates

- RLCN强化学习研究 - http://rlchina.org/ (html, T2)
- 机器学习研究杂志（JMLR） - http://www.jmlr.org/ (html, T2)
- Andrej Karpathy - https://karpathy.ai/ (html, T2)
- Yarin Gal - https://www.cs.ox.ac.uk/people/yarin.gal/website (html, T1.5)
- Christopher Olah - http://colah.github.io/ (html, T2)
- The Information - https://www.theinformation.com/ (html, T2)
- SemiAnalysis - https://semianalysis.com/ (html, T2)
- Lex Fridman - https://podcasts.apple.com/us/podcast/lex-fridman-podcast/id1434243584 (podcast_feed, T2)
- Paul Graham - http://paulgraham.com/articles.html (html, T2)
- Stratechery - https://stratechery.com/category/articles (html, T2)
- Not Boring - https://www.notboring.co/ (html, T2)
- The Generalist - https://www.generalist.com/ (html, T2)
- Elad Gil - https://blog.eladgil.com/archive (html, T2)
- Benedict Evans - https://www.ben-evans.com/ (html, T1.5)
- Sam Altman - https://blog.samaltman.com/ (html, T2)
- Marc Andreessen - https://pmarca.substack.com/ (html, T1.5)
- Implications - https://www.implications.com/archive?sort=new (html, T1.5)
- Lilian Weng - https://lilianweng.github.io/ (html, T1.5)
- Latent Space - https://www.latent.space/ (html, T1.5)
- Thesephist - https://thesephist.com/ (html, T1.5)
- Fabricated Knowledge - https://www.fabricatedknowledge.com/ (html, T1.5)
- Turing Post - https://www.turingpost.com/ (html, T1.5)
- Epoch AI - https://epochai.substack.com/archive (html, T1.5)
- Stephen Wolfram - https://writings.stephenwolfram.com/ (html, T1.5)
- The Strategy Desk - https://alexsandu.substack.com/ (html, T1.5)
- A16Z - https://a16z.com/news-content (html, T2)
- Sequoia - https://www.sequoiacap.com/stories/?_story-category=perspective (html, T2)
- Apoorv’s notes - https://apoorv03.com/ (html, T2)
- Heartcore insights - https://heartcore.substack.com/ (html, T1.5)
- Coatue - https://www.coatue.com/insights (html, T2)

## Audit-only Rows

- None.
