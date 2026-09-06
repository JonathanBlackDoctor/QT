// Candidate URL slugs are discovery hints, never evidence of a successful fetch.
const ROWS = `창세기|Genesis|genesis|창
출애굽기|Exodus|exodus|출
레위기|Leviticus|leviticus|레
민수기|Numbers|numbers|민
신명기|Deuteronomy|deuteronomy|신
여호수아|Joshua|joshua|수
사사기|Judges|judges|삿
룻기|Ruth|ruth|룻
사무엘상|1 Samuel|1-samuel|삼상
사무엘하|2 Samuel|2-samuel|삼하
열왕기상|1 Kings|1-kings|왕상
열왕기하|2 Kings|2-kings|왕하
역대상|1 Chronicles|1-chronicles|대상
역대하|2 Chronicles|2-chronicles|대하
에스라|Ezra|ezra|스
느헤미야|Nehemiah|nehemiah|느
에스더|Esther|esther|에
욥기|Job|job|욥
시편|Psalms|psalms|시
잠언|Proverbs|proverbs|잠
전도서|Ecclesiastes|ecclesiastes|전
아가|Song of Songs|song-of-songs|아
이사야|Isaiah|isaiah|사
예레미야|Jeremiah|jeremiah|렘
예레미야애가|Lamentations|lamentations|애
에스겔|Ezekiel|ezekiel|겔
다니엘|Daniel|daniel|단
호세아|Hosea|hosea|호
요엘|Joel|joel|욜
아모스|Amos|amos|암
오바댜|Obadiah|obadiah|옵
요나|Jonah|jonah|욘
미가|Micah|micah|미
나훔|Nahum|nahum|나
하박국|Habakkuk|habakkuk|합
스바냐|Zephaniah|zephaniah|습
학개|Haggai|haggai|학
스가랴|Zechariah|zechariah|슥
말라기|Malachi|malachi|말
마태복음|Matthew|matthew|마
마가복음|Mark|mark|막
누가복음|Luke|luke|눅
요한복음|John|john|요
사도행전|Acts|acts|행
로마서|Romans|romans|롬
고린도전서|1 Corinthians|1-corinthians|고전
고린도후서|2 Corinthians|2-corinthians|고후
갈라디아서|Galatians|galatians|갈
에베소서|Ephesians|ephesians|엡
빌립보서|Philippians|philippians|빌
골로새서|Colossians|colossians|골
데살로니가전서|1 Thessalonians|1-thessalonians|살전
데살로니가후서|2 Thessalonians|2-thessalonians|살후
디모데전서|1 Timothy|1-timothy|딤전
디모데후서|2 Timothy|2-timothy|딤후
디도서|Titus|titus|딛
빌레몬서|Philemon|philemon|몬
히브리서|Hebrews|hebrews|히
야고보서|James|james|약
베드로전서|1 Peter|1-peter|벧전
베드로후서|2 Peter|2-peter|벧후
요한일서|1 John|1-john|요일
요한이서|2 John|2-john|요이
요한삼서|3 John|3-john|요삼
유다서|Jude|jude|유
요한계시록|Revelation|revelation|계`;

export const PROJECT_BOOKS = ROWS.split('\n').map(row => {
  const [ko, en, slug, abbr] = row.split('|');
  return { ko, en, slug, abbr };
});

export function locateBook(passage) {
  const match = String(passage ?? '').match(/^(.+?)\s*(\d{1,3}):\d{1,3}/u);
  if (!match) return null;
  const name = match[1].trim().replace(/^애가$/, '예레미야애가');
  return PROJECT_BOOKS.find(book => book.ko === name || book.abbr === name) ?? null;
}

export function mentionsBook(text, book) {
  if (!book) return false;
  const value = String(text ?? '');
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^가-힣])${esc(book.ko)}(?=$|[^가-힣])`, 'u').test(value)
    || new RegExp(`\\b${esc(book.en)}\\b`, 'i').test(value);
}

export function bibleProjectCandidates(book) {
  return [
    `https://bibleproject.com/guides/book-of-${book.slug}/`,
    `https://bibleproject.com/explore/video/${book.slug}/`,
  ];
}
