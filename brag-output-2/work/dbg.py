import asyncio
from playwright.async_api import async_playwright
import render
async def main():
    async with async_playwright() as pw:
        b,p=await render.page_ready(pw)
        print(await p.evaluate("[V.login.card.offsetHeight, V.login.ill.style.top, V.login.card.querySelector('.glass').offsetHeight, V.signup.max]"))
        await b.close()
asyncio.run(main())
