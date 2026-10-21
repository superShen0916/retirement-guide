#!/usr/bin/env python3
"""Prepare an allowlisted deployment checkout; never copy private local state."""
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STAGE = ROOT / '.deploy' / 'retirement-before'
DIRECTORIES = ('site', 'assets', 'docs', 'templates', 'examples', 'tools', 'tests', '.github', 'dist')
FILES = ('README.md', 'CONTRIBUTING.md', 'RELEASE.md', 'CHANGELOG.md', 'LICENSE', 'VALIDATION.md', '.gitignore', '阅读版.html')


def main():
    if not (ROOT / '.openai/hosting.json').is_file() or not (ROOT / 'dist/index.html').is_file():
        raise SystemExit('先完成站点注册与 tools/build_site.py 构建，再准备部署源码。')
    STAGE.mkdir(parents=True, exist_ok=True)
    stage_root = STAGE.resolve()
    if (not stage_root.is_relative_to(ROOT)
            or not stage_root.is_relative_to((ROOT / '.deploy').resolve())
            or STAGE.is_symlink()):
        raise SystemExit('部署目录必须留在本项目 .deploy 内，且不能为符号链接。')
    for name in DIRECTORIES:
        source, target = ROOT / name, STAGE / name
        if target.is_symlink() or not target.resolve().is_relative_to(stage_root):
            raise SystemExit('拒绝清理越界或符号链接部署路径：' + str(target))
        if target.exists():
            # This is generated content inside the checked deployment directory.
            shutil.rmtree(target)
        shutil.copytree(source, target, ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
    for name in FILES:
        shutil.copyfile(ROOT / name, STAGE / name)
    # The deployment repository is a self-sufficient static snapshot. GitHub's
    # authoring checkout still ignores dist; this exception lives only here.
    staged_ignore = (ROOT / '.gitignore').read_text(encoding='utf-8')
    (STAGE / '.gitignore').write_text(staged_ignore + '\n# Static deployment snapshot\n!dist/\n!dist/**\n',
                                     encoding='utf-8', newline='\n')
    (STAGE / '.openai').mkdir(exist_ok=True)
    shutil.copyfile(ROOT / '.openai/hosting.json', STAGE / '.openai/hosting.json')
    print('Deployment source staged:', STAGE)


if __name__ == '__main__':
    main()
