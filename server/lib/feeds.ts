// Public RSS/Atom feeds aggregated by /api/news.
// Deliberately spans many countries and ownership types so no single country or
// outlet dominates the picture. `standing` and `ownership` are editorial metadata
// (see shared/types.ts); edit this file or the `source_ratings` table to change them.
import type { Category, Standing } from '../../shared/types';

export { CATEGORY_LABELS } from '../../shared/categories';

export interface FeedDef {
  id: string;
  name: string;
  domain: string;
  url: string;
  country: string; // ISO alpha-3 of the outlet's home country
  category: Category;
  standing: Standing;
  ownership: string | null; // disclosed ownership/funding type, e.g. 'public broadcaster', 'state-affiliated'
}

export const FEEDS: FeedDef[] = [
  // World / international
  { id: 'bbc-world', name: 'BBC News', domain: 'bbc.co.uk', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', country: 'GBR', category: 'world', standing: 'A', ownership: 'public broadcaster' },
  { id: 'dw-world', name: 'DW News', domain: 'dw.com', url: 'https://rss.dw.com/rdf/rss-en-world', country: 'DEU', category: 'world', standing: 'A', ownership: 'public broadcaster' },
  { id: 'france24', name: 'France 24', domain: 'france24.com', url: 'https://www.france24.com/en/rss', country: 'FRA', category: 'world', standing: 'A', ownership: 'public broadcaster' },
  { id: 'npr-world', name: 'NPR World', domain: 'npr.org', url: 'https://feeds.npr.org/1004/rss.xml', country: 'USA', category: 'world', standing: 'A', ownership: 'public broadcaster' },
  { id: 'un-news', name: 'UN News', domain: 'news.un.org', url: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml', country: 'USA', category: 'world', standing: 'A', ownership: 'intergovernmental (United Nations)' },
  { id: 'aljazeera', name: 'Al Jazeera', domain: 'aljazeera.com', url: 'https://www.aljazeera.com/xml/rss/all.xml', country: 'QAT', category: 'world', standing: 'B', ownership: 'state-funded (Qatar)' },
  { id: 'guardian-world', name: 'The Guardian (World)', domain: 'theguardian.com', url: 'https://www.theguardian.com/world/rss', country: 'GBR', category: 'world', standing: 'B', ownership: 'trust-owned' },
  { id: 'xinhua', name: 'Xinhua', domain: 'xinhuanet.com', url: 'http://www.xinhuanet.com/english/rss/worldrss.xml', country: 'CHN', category: 'world', standing: 'B', ownership: 'state-affiliated (China)' },
  { id: 'scmp', name: 'South China Morning Post', domain: 'scmp.com', url: 'https://www.scmp.com/rss/91/feed', country: 'HKG', category: 'world', standing: 'B', ownership: 'private' },
  { id: 'japantimes', name: 'The Japan Times', domain: 'japantimes.co.jp', url: 'https://www.japantimes.co.jp/feed/', country: 'JPN', category: 'world', standing: 'B', ownership: 'private' },
  { id: 'abc-au', name: 'ABC News (Australia)', domain: 'abc.net.au', url: 'https://www.abc.net.au/news/feed/51120/rss.xml', country: 'AUS', category: 'world', standing: 'A', ownership: 'public broadcaster' },

  // Regional voices
  { id: 'dawn', name: 'Dawn', domain: 'dawn.com', url: 'https://www.dawn.com/feeds/home', country: 'PAK', category: 'regional', standing: 'B', ownership: 'private' },
  { id: 'toi', name: 'The Times of India', domain: 'timesofindia.indiatimes.com', url: 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms', country: 'IND', category: 'regional', standing: 'B', ownership: 'private' },
  { id: 'the-hindu', name: 'The Hindu', domain: 'thehindu.com', url: 'https://www.thehindu.com/news/international/feeder/default.rss', country: 'IND', category: 'regional', standing: 'B', ownership: 'private' },
  { id: 'allafrica', name: 'AllAfrica (aggregator)', domain: 'allafrica.com', url: 'https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf', country: 'ZAF', category: 'regional', standing: 'C', ownership: 'aggregator' },
  { id: 'premium-times', name: 'Premium Times (Nigeria)', domain: 'premiumtimesng.com', url: 'https://www.premiumtimesng.com/feed', country: 'NGA', category: 'regional', standing: 'B', ownership: 'private' },
  { id: 'daily-maverick', name: 'Daily Maverick', domain: 'dailymaverick.co.za', url: 'https://www.dailymaverick.co.za/feed/', country: 'ZAF', category: 'regional', standing: 'B', ownership: 'private' },
  { id: 'mexico-news', name: 'Mexico News Daily', domain: 'mexiconewsdaily.com', url: 'https://mexiconewsdaily.com/feed/', country: 'MEX', category: 'regional', standing: 'B', ownership: 'private' },

  // Conflict & crisis reporting
  { id: 'kyiv-independent', name: 'Kyiv Independent', domain: 'kyivindependent.com', url: 'https://kyivindependent.com/feed/', country: 'UKR', category: 'conflict', standing: 'B', ownership: 'nonprofit / independent' },

  // Politics
  { id: 'npr-politics', name: 'NPR Politics', domain: 'npr.org', url: 'https://feeds.npr.org/1014/rss.xml', country: 'USA', category: 'politics', standing: 'A', ownership: 'public broadcaster' },
  { id: 'guardian-politics', name: 'The Guardian (Politics)', domain: 'theguardian.com', url: 'https://www.theguardian.com/politics/rss', country: 'GBR', category: 'politics', standing: 'B', ownership: 'trust-owned' },
  { id: 'politico', name: 'Politico', domain: 'politico.com', url: 'https://www.politico.com/rss/politicopicks.xml', country: 'USA', category: 'politics', standing: 'B', ownership: 'private' },

  // Technology
  { id: 'bbc-tech', name: 'BBC Technology', domain: 'bbc.co.uk', url: 'https://feeds.bbci.co.uk/news/technology/rss.xml', country: 'GBR', category: 'tech', standing: 'A', ownership: 'public broadcaster' },
  { id: 'ars', name: 'Ars Technica', domain: 'arstechnica.com', url: 'https://feeds.arstechnica.com/arstechnica/index', country: 'USA', category: 'tech', standing: 'B', ownership: 'private (Condé Nast)' },
  { id: 'verge', name: 'The Verge', domain: 'theverge.com', url: 'https://www.theverge.com/rss/index.xml', country: 'USA', category: 'tech', standing: 'B', ownership: 'private (Vox Media)' },
  { id: 'wired', name: 'WIRED', domain: 'wired.com', url: 'https://www.wired.com/feed/rss', country: 'USA', category: 'tech', standing: 'B', ownership: 'private (Condé Nast)' },

  // Sports
  { id: 'bbc-sport', name: 'BBC Sport', domain: 'bbc.co.uk', url: 'https://feeds.bbci.co.uk/sport/rss.xml', country: 'GBR', category: 'sports', standing: 'A', ownership: 'public broadcaster' },
  { id: 'espn', name: 'ESPN', domain: 'espn.com', url: 'https://www.espn.com/espn/rss/news', country: 'USA', category: 'sports', standing: 'B', ownership: 'private' },
  { id: 'guardian-sport', name: 'The Guardian (Sport)', domain: 'theguardian.com', url: 'https://www.theguardian.com/uk/sport/rss', country: 'GBR', category: 'sports', standing: 'B', ownership: 'trust-owned' },

  // Business & markets
  { id: 'bbc-business', name: 'BBC Business', domain: 'bbc.co.uk', url: 'https://feeds.bbci.co.uk/news/business/rss.xml', country: 'GBR', category: 'business', standing: 'A', ownership: 'public broadcaster' },
  { id: 'cnbc', name: 'CNBC', domain: 'cnbc.com', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', country: 'USA', category: 'business', standing: 'B', ownership: 'private (NBCUniversal)' },
  { id: 'marketwatch', name: 'MarketWatch', domain: 'marketwatch.com', url: 'https://feeds.marketwatch.com/marketwatch/topstories/', country: 'USA', category: 'business', standing: 'B', ownership: 'private (Dow Jones)' },

  // Science, health, environment
  { id: 'bbc-science', name: 'BBC Science & Environment', domain: 'bbc.co.uk', url: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml', country: 'GBR', category: 'science', standing: 'A', ownership: 'public broadcaster' },
  { id: 'bbc-health', name: 'BBC Health', domain: 'bbc.co.uk', url: 'https://feeds.bbci.co.uk/news/health/rss.xml', country: 'GBR', category: 'health', standing: 'A', ownership: 'public broadcaster' },
  { id: 'guardian-science', name: 'The Guardian (Science)', domain: 'theguardian.com', url: 'https://www.theguardian.com/science/rss', country: 'GBR', category: 'science', standing: 'B', ownership: 'trust-owned' },
  { id: 'nasa', name: 'NASA', domain: 'nasa.gov', url: 'https://www.nasa.gov/feed/', country: 'USA', category: 'science', standing: 'A', ownership: 'government agency (primary source)' },
];
