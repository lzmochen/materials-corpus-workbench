"""Execute the workbench's business API in one visitor's browser."""
import base64
import hashlib
import io
import json
import re
from contextlib import closing
from pathlib import Path

import corpus_topics
import distillation
import expert
import research_case
import guide_contrast
import quality_work
import pipeline_work
import benchmark_work
import guide_eval
import guide_standards
import lineage
import luoshu
import luoshu_config
import production
import service
from core import ApiError, Context, MEETING_MEMBERS, connect, ensure_document_tables, fail, now
import browser_media

DATABASE = '/visitor.sqlite3'
MEMBERS = {name: (display, role) for name, display, role in MEETING_MEMBERS}
MODULES = (research_case, quality_work, pipeline_work, benchmark_work, corpus_topics, guide_standards, guide_eval, guide_contrast, distillation, lineage,
           production, expert, service, luoshu_config, luoshu)


def user(username):
    display, role = MEMBERS[username]
    return {'username': username, 'display': display, 'role': role, 'meeting': True}


def setup_database():
    with closing(connect(DATABASE)) as db:
        db.execute('PRAGMA journal_mode = DELETE')
        db.execute('BEGIN IMMEDIATE')
        ensure_document_tables(db)
        db.executemany('''INSERT INTO users(username, display, role, salt, password_hash)
            VALUES(?,?,?,'','') ON CONFLICT(username) DO UPDATE
            SET display=excluded.display, role=excluded.role
            WHERE users.display!=excluded.display OR users.role!=excluded.role''', MEETING_MEMBERS)
        db.commit()


def pdf_text(raw):
    from pypdf import PdfReader
    try:
        document = PdfReader(io.BytesIO(raw))
        if document.is_encrypted and not document.decrypt(''):
            fail(422, '请解除 PDF 的打开密码后重新上传')
        if len(document.pages) > 500:
            fail(422, 'PDF 超过 500 页，请拆分后解析')
        pages, size = [], 0
        for page in document.pages:
            text = page.extract_text() or ''
            size += len(text)
            if size > 4 * production.MAX_FILE_BYTES:
                fail(422, 'PDF 文字超过处理上限，请拆分后解析')
            pages.append(text)
        return '\f'.join(pages)
    except ApiError:
        raise
    except Exception:
        fail(422, 'PDF 无法读取，请检查原文件或转成含文字的 PDF')


production.pdf_content = pdf_text


async def image_lines(ctx, job):
    resource = ctx.require('resources', job['payload']['resourceId'])
    version = production.resolve_version(resource, job['payload']['versionId'])
    extension = Path(version['filename']).suffix.lower()
    if extension not in production.IMAGE_FORMATS:
        return None
    raw = ctx.read_blob(version['sha256'])
    try:
        info = json.loads(await browser_media.recognize(raw, extension))
    except Exception:
        fail(422, '图像文字识别失败，请检查图像或网络后重试')
    if info.get('error'):
        fail(422, info['error'])
    lines = info['lines']
    if not lines:
        fail(422, '图中没有识别出文字，请使用更清晰的原件')
    def blocks(_raw, _ext, fields_for, max_blocks, max_text):
        if len(lines) > max_blocks or any(len(line['text']) > max_text for line in lines):
            fail(422, '图像文字超过单次处理上限，请裁剪图像后重试')
        return [{'id': f'B{i:04d}', 'location': f'图纸第 {i} 行', 'text': line['text'],
                 'bbox': line['bbox'], 'confidence': line['confidence'], 'fields': fields_for(line['text']),
                 'ocrEngine': info['engine']} for i, line in enumerate(lines, 1)]
    return blocks


async def drain_job(ctx):
    row = ctx.db.execute("SELECT payload FROM jobs WHERE json_extract(payload,'$.status') IN ('queued','running') ORDER BY rowid LIMIT 1").fetchone()
    if row is None:
        return
    job = json.loads(row['payload'])
    original_reader = production.drawing_blocks
    ctx.db.execute('SAVEPOINT processing')
    job.update(status='running', startedAt=now(), attempts=job.get('attempts', 0) + 1)
    try:
        if job['kind'] == 'parse':
            reader = await image_lines(ctx, job)
            if reader:
                production.drawing_blocks = reader
        result = production.run_job(ctx, job['kind'], job['payload'])
        job.update(status='completed', result=result, finishedAt=now())
        ctx.audit('job.completed', job['id'], job['kind'])
    except Exception as exc:
        ctx.db.execute('ROLLBACK TO processing')
        msg = str(exc) if isinstance(exc, ApiError) else '加工任务失败，请核对文件格式并重试'
        production.job_failure(ctx, job['kind'], job['payload'], msg)
        job.update(status='failed', finishedAt=now(), error=msg)
        ctx.audit('job.failed', job['id'], msg)
    finally:
        production.drawing_blocks = original_reader
        ctx.db.execute('RELEASE processing')
    ctx.put('jobs', job)


async def contrast(ctx, data):
    ctx.allow(*guide_contrast.EDITORS)
    ids, _, _, _ = guide_contrast.parameters(data)
    cache = {}
    total = 0
    for pair_id in ids:
        pair = ctx.require('multimodal_pairs', pair_id)
        digest = pair['image']['sha256']
        if digest in cache:
            continue
        raw = ctx.read_blob(digest)
        total += len(raw)
        if len(raw) > 4*1024**2 or total > 16*1024**2:
            fail(413, '图像大小超过训练上限')
        try:
            values = json.loads(await browser_media.imagePixels(raw))
        except Exception:
            fail(422, '无法解码训练原图，请使用有效的 PNG 或 JPEG')
        cache[digest] = values
    previous = guide_contrast.image_features
    guide_contrast.image_features = lambda raw, _ext: cache[hashlib.sha256(raw).hexdigest()]
    try:
        return guide_contrast.run(ctx, data)
    finally:
        guide_contrast.image_features = previous


async def handle(ctx, method, path, data):
    if path == '/api/session' and method == 'GET':
        return ctx.user
    if path == '/api/health' and method == 'GET':
        return {'status': 'ok'}
    if path == '/api/meeting/role' and method == 'POST':
        desired = data.get('username')
        if not isinstance(desired, str) or desired not in MEMBERS:
            fail(400, '请选择有效经办人')
        return user(desired)
    if path == '/api/users' and method == 'GET':
        ctx.allow('operator')
        return [user(name) for name in MEMBERS]
    if path == '/api/jobs' and method == 'GET':
        return [{k:v for k,v in job.items() if k not in ('payload','result')} for job in ctx.all('jobs')[:100]]
    if re.fullmatch('/api/jobs/[A-Z0-9-]+', path) and method == 'GET':
        return {k:v for k,v in ctx.require('jobs', path.rsplit('/',1)[-1]).items() if k not in ('payload','result')}
    if path == '/api/audit' and method == 'GET':
        ctx.allow('operator')
        return [dict(row) for row in ctx.db.execute('SELECT * FROM audit_log ORDER BY seq DESC LIMIT 100')]
    if path == '/api/luoshu/configs/import-preview' and method == 'POST':
        import yaml
        ctx.allow(*production.OPERATORS)
        text = data.get('yaml')
        if not isinstance(text, str) or not 0 < len(text.encode()) <= 65536:
            fail(400, 'YAML 文件须在 64 KiB 以内')
        try:
            if any(isinstance(event, yaml.events.AliasEvent) for event in yaml.parse(text)):
                fail(400, '配置模板不能使用 YAML 别名')
            decoded = yaml.safe_load(text)
        except yaml.YAMLError:
            fail(400, 'YAML 格式无效，请核对模板文件')
        if not isinstance(decoded, dict) or 'fields' not in decoded:
            fail(400, '模板缺少字段定义')
        return luoshu_config.normalized(decoded)
    if path == '/api/contrast-experiments' and method == 'POST':
        return await contrast(ctx, data)
    for module in MODULES:
        result = module.handle(ctx, method, path, data)
        if result is not None:
            return result
    fail(404, '业务接口不存在')


async def execute_request(method, path, role, body):
    with closing(connect(DATABASE)) as db:
        db.execute('BEGIN IMMEDIATE')
        try:
            if role not in MEMBERS:
                fail(400, '经办人无效，请重新选择角色')
            ctx = Context(db, user(role))
            research_case.seed(db)
            if method == 'QUEUE':
                await drain_job(Context(db, {'username':'system','role':'admin','display':'任务执行器'}))
                result = {}
            else:
                data = json.loads(body or '{}')
                if not isinstance(data,dict):
                    fail(400, '请求须为 JSON 对象')
                result = await handle(ctx, method, path, data)
            queued = bool(db.execute("SELECT 1 FROM jobs WHERE json_extract(payload,'$.status') IN ('queued','running') LIMIT 1").fetchone())
            db.commit()
            return json.dumps({'status':200,'data':result,'changed':bool(db.total_changes),'queued':queued}, ensure_ascii=False, allow_nan=False)
        except ApiError as exc:
            db.rollback()
            return json.dumps({'status':exc.status,'data':{'error':str(exc)}},ensure_ascii=False)
        except Exception:
            db.rollback()
            raise
