# Smoke test (needs: pip install playwright; playwright install chromium; serve this folder on :8765)
import json, re
from playwright.sync_api import sync_playwright
errs=[]; 
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':844}, locale='ar-EG', timezone_id='Africa/Cairo', service_workers='allow')
    pg=ctx.new_page()
    pg.on('console', lambda m: errs.append((m.type,m.text)) if m.type in('error','warning') else None)
    pg.on('pageerror', lambda e: errs.append(('pageerror',str(e))))
    pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(800)
    assert pg.is_visible('#modalProfile.open'), 'onboarding not auto-opened'
    st=pg.evaluate("localStorage.getItem('wekaya_v2')"); print('state before onboarding:', st)
    assert not pg.is_visible('#profileClose'), 'close should be hidden on first run'
    pg.screenshot(path='/tmp/s1_onboarding.png')
    # step1
    pg.fill('#pName','جنى'); pg.select_option('#pGender','female'); pg.fill('#pBirth','1980-05-10'); pg.fill('#pHeight','165'); pg.fill('#pWeight','84.5')
    print('bmi preview:', pg.inner_text('#bmiPreview'))
    pg.click('[data-action=ob-next]'); assert pg.is_visible('#obStep2')
    pg.click('#profileForm button[type=submit]'); print('consent err:', pg.inner_text('#obMsg2'))
    pg.check('#pConsent'); pg.fill('#pWaist','98'); pg.click('#profileForm button[type=submit]'); pg.wait_for_timeout(300)
    assert not pg.is_visible('#modalProfile.open'); assert pg.is_visible('#dashMain')
    print('hero (no labs):', pg.inner_text('#heroTitle'))
    # labs
    pg.click('#nav-labs'); pg.fill('#labAst','34'); pg.fill('#labAlt','42'); pg.fill('#labPlt','235'); pg.click('#labForm button[type=submit]'); pg.wait_for_timeout(300)
    print('hero low:', pg.inner_text('#heroTitle'),'|',pg.inner_text('#nextDate'),'|', pg.inner_text('#nextLabel'))
    pg.screenshot(path='/tmp/s2_dashboard.png', full_page=True)
    pg.click('#nav-labs'); pg.fill('#labDate','2026-01-15'); pg.fill('#labAst','60'); pg.fill('#labAlt','50'); pg.fill('#labPlt','150'); pg.click('#labForm button[type=submit]'); pg.wait_for_timeout(300)
    pg.click('#nav-labs'); print('history rows:', pg.locator('#labHistory .logged-item-row').count())
    pg.screenshot(path='/tmp/s3_labs.png', full_page=True)
    # future date rejected
    pg.fill('#labDate','2030-01-01'); pg.fill('#labAst','30'); pg.fill('#labAlt','30'); pg.fill('#labPlt','200'); pg.click('#labForm button[type=submit]'); print('future err:', pg.inner_text('#labMsg'))
    # food
    pg.click('#nav-food'); pg.click('[data-action=add-food][data-id=ful]'); pg.click('[data-action=add-food][data-id=egg2]'); print('logged total:', pg.inner_text('#loggedTotal'))
    pg.fill('#foodSearch','كشري'); print('search results:', pg.locator('#foodList .food-item-card').count()); pg.fill('#foodSearch','')
    pg.screenshot(path='/tmp/s4_food.png')
    pg.click('#nav-home' if False else '#nav-dashboard'); print('cal remaining:', pg.inner_text('#calRemaining'), pg.inner_text('#calRemLabel'), 'target', pg.inner_text('#calTarget'))
    # XSS custom food
    pg.click('#nav-food'); pg.click('[data-action=open-custom-food]'); pg.fill('#cfName','<img src=x onerror=window.__x=1>'); pg.fill('#cfCal','100'); pg.click('#foodForm button[type=submit]'); pg.click('[data-action=add-food][data-id^=c]'); pg.wait_for_timeout(200)
    print('xss executed:', pg.evaluate('window.__x===1'))
    # progress
    pg.click('#nav-progress')
    for d,w in [('2026-10-01','86.0'),('2026-10-10','85.2'),('2026-10-20','84.0')]:
        pg.fill('#wDate',d); pg.fill('#wValue',w); pg.click('#weightForm button[type=submit]')
    pg.click('#nav-progress'); print('svg chart:', pg.locator('#weightChart svg').count(), '| change:', pg.inner_text('#statChange'))
    pg.screenshot(path='/tmp/s5_progress.png', full_page=True)
    # faq
    pg.click('[data-action=open-faq]'); pg.fill('#chatInput','عندي اصفرار في العين'); pg.press('#chatInput','Enter'); print('redflag:', pg.locator('.chat-bubble.alert').count())
    pg.click('[data-action=faq-chip][data-id=coffee]'); pg.screenshot(path='/tmp/s6_faq.png'); pg.keyboard.press('Escape'); assert not pg.is_visible('#modalFaq.open')
    # english
    pg.click('#btnLang'); print('EN title:', pg.title(), '| dir', pg.evaluate('document.documentElement.dir'), '|', pg.inner_text('#heroTitle')); pg.screenshot(path='/tmp/s7_en.png', full_page=True); pg.click('#btnLang')
    # guidelines
    pg.click('#nav-guidelines'); print('pillars', pg.locator('.guideline-pillar-card').count(), 'refs', pg.locator('#refList li').count())
    # overflow check
    print('h-overflow:', pg.evaluate('document.documentElement.scrollWidth > window.innerWidth'))
    # export
    pg.click('[data-action=open-settings]')
    with pg.expect_download() as d: pg.click('[data-action=export-json]')
    path=d.value.path(); data=json.load(open(path)); print('export keys:', sorted(data.keys())[:6], 'labs', len(data['labs']))
    pg.screenshot(path='/tmp/s8_settings.png'); pg.keyboard.press('Escape')
    # offline
    pg.wait_for_timeout(1500); print('sw controller:', pg.evaluate('!!navigator.serviceWorker.controller'))
    ctx.set_offline(True); pg.reload(); pg.wait_for_timeout(800)
    print('offline banner:', pg.is_visible('#offlineBanner'), '| dash visible:', pg.is_visible('#dashMain'), '| font ok:', pg.evaluate("document.fonts.check('16px Tajawal')"))
    ctx.set_offline(False)
    # persistence + delete all
    pg.reload(); pg.wait_for_timeout(500); print('persisted profile name:', pg.inner_text('#pillName'))
    pg.click('[data-action=open-settings]'); pg.once('dialog', lambda dlg: dlg.accept()); pg.click('[data-action=delete-all]'); pg.wait_for_timeout(300)
    print('after delete -> onboarding open:', pg.is_visible('#modalProfile.open'), '| state:', pg.evaluate("localStorage.getItem('wekaya_v2')")[:60])
    b.close()
print('CONSOLE ISSUES:', errs)
