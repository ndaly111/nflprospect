"""
Fetch NFL draft news from ESPN's unofficial API.
Returns list of {headline, url, published, image, source}
"""
import logging
import requests

logger = logging.getLogger(__name__)
HEADERS = {'User-Agent': 'Mozilla/5.0 (compatible; NFLDraftBot/1.0)'}
TIMEOUT = 15


def fetch_draft_news(limit: int = 20) -> list[dict]:
    """Fetch recent NFL draft news from ESPN."""
    urls = [
        'https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=50',
        f'https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=50&draft=true',
    ]

    articles = []
    seen = set()

    for url in urls:
        try:
            r = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
            r.raise_for_status()
            data = r.json()
            items = data.get('articles', [])

            for item in items:
                headline = item.get('headline', '')
                if not headline or headline in seen:
                    continue
                # Filter to draft-related articles
                text = (headline + ' ' + item.get('description', '')).lower()
                if not any(kw in text for kw in ['draft', 'prospect', 'combine', 'scouting', 'nfl draft']):
                    continue

                seen.add(headline)
                image = None
                if item.get('images'):
                    image = item['images'][0].get('url')

                articles.append({
                    'headline': headline,
                    'url': item.get('links', {}).get('web', {}).get('href', ''),
                    'published': item.get('published', ''),
                    'image': image,
                    'source': 'ESPN',
                    'description': item.get('description', ''),
                })

        except Exception as e:
            logger.warning(f'ESPN news fetch failed ({url}): {e}')

    logger.info(f'ESPN news: {len(articles)} draft articles')
    return articles[:limit]


if __name__ == '__main__':
    logging.basicConfig(level=logging.INFO)
    news = fetch_draft_news()
    print(f'Total: {len(news)} articles')
    for a in news[:3]:
        print(f'  [{a["published"][:10]}] {a["headline"]}')
