/**
 * 运行时安装器（D8 决策）：本地嵌入的推理运行时（@huggingface/transformers，
 * 纯库、二进制随 npm 包分发、零 postinstall）在用户首次开启本地嵌入时才安装——
 * 插件 npm 包本体不带重依赖，不用本地嵌入的用户零成本。
 *
 * - 安装位置：数据目录 runtime/（自带 package.json 锚定，防 npm 向上层目录逃逸安装）；
 * - 子进程 npm ci --ignore-scripts --no-audit --no-fund，钉死精确版本 + 随包 lockfile
 *   （resources/runtime-package-lock.json，构建期拷入 dist/）锁定完整传递依赖树——
 *   纯 install 只锁直接依赖的精确版本，传递依赖按 semver 浮动解析，registry 端
 *   后续发布/投毒会随安装时间漂移；lockfile 把树冻结在作者侧。ci 失败（lock 与
 *   package.json 漂移等）自动回退 npm install 精确版本（可用性优先，树不再受锁）；
 * - 进度（用户硬性要求：不能傻等）：npm 非交互模式无百分比 API，采用不确定进度——
 *   已耗时 + 子进程 stdout/stderr 尾行实时流出 + 可 kill；
 * - 幂等：已装版本 == 目标版本直接就绪；版本漂移（插件升级换了钉死版本）重装覆盖。
 */
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
/** 钉死的 transformers.js 版本（D8：精确版本，升级插件时在此变更并重装运行时）。 */
export const PINNED_TRANSFORMERS_VERSION = '4.2.0';
export class RuntimeInstaller {
    runtimeDir;
    target;
    logger;
    spawnImpl;
    /** 随包 lockfile 路径（测试可注入；默认取 dist 根下构建期拷入的资产）。 */
    lockfileSource;
    progress;
    child = null;
    current = null;
    /** 安装超时（npm 卡死不罕见：registry 停滞即永挂，applyBusy 会被锁死）。每次 spawn 独立计时。 */
    static INSTALL_TIMEOUT_MS = 10 * 60_000;
    constructor(dataDir, targetVersion, opts) {
        this.runtimeDir = path.join(dataDir, 'runtime');
        this.target = targetVersion;
        this.logger = opts?.logger;
        this.lockfileSource =
            opts?.lockfileSource ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'runtime-package-lock.json');
        this.spawnImpl =
            opts?.spawnImpl ??
                ((command, args, cwd) => {
                    const child = spawn(command, args, {
                        cwd,
                        // Windows 上 .cmd 必须走 shell（Node 20+ 安全限制）；参数全部来自插件常量，无注入面
                        shell: process.platform === 'win32',
                        windowsHide: true,
                    });
                    const spawned = {
                        onStdout(cb) {
                            child.stdout?.on('data', (d) => String(d).split(/\r?\n/).forEach((l) => l && cb(l)));
                        },
                        onStderr(cb) {
                            child.stderr?.on('data', (d) => String(d).split(/\r?\n/).forEach((l) => l && cb(l)));
                        },
                        // Windows shell:true 下 child 只是 cmd.exe，npm/node 孙进程不随 child.kill()
                        // 终止（超时与取消都会"表面停止"）——taskkill /T 按进程树杀；启动失败回退裸 kill
                        kill: () => {
                            if (process.platform === 'win32' && child.pid !== undefined) {
                                const tk = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
                                tk.on('error', () => child.kill());
                            }
                            else {
                                child.kill();
                            }
                        },
                        // 'error'（如 ENOENT：PATH 无 npm）只发 error 不发 close——不监听会永挂
                        exited: new Promise((resolve) => {
                            child.on('close', (code) => resolve(code));
                            child.on('error', () => resolve(null));
                        }),
                    };
                    return spawned;
                });
        this.progress = {
            phase: 'idle',
            targetVersion: targetVersion,
            installedVersion: null,
            startedAt: 0,
            elapsedMs: 0,
            lastLines: [],
        };
    }
    /** 包内模块名（与钉死版本一起构成安装目标）。 */
    static packageName = '@huggingface/transformers';
    /** 进度快照。 */
    getProgress() {
        const elapsed = this.progress.phase === 'installing' ? Date.now() - this.progress.startedAt : this.progress.elapsedMs;
        return { ...this.progress, lastLines: [...this.progress.lastLines], elapsedMs: elapsed };
    }
    pkgJsonPath() {
        return path.join(this.runtimeDir, 'node_modules', RuntimeInstaller.packageName, 'package.json');
    }
    /** 已就位版本（读 package.json；未安装返回 null）。 */
    async installedVersion() {
        try {
            const raw = await fs.readFile(this.pkgJsonPath(), 'utf8');
            const pkg = JSON.parse(raw);
            return typeof pkg.version === 'string' ? pkg.version : null;
        }
        catch {
            return null;
        }
    }
    /** 是否就绪（版本精确匹配目标）。 */
    async isReady() {
        return (await this.installedVersion()) === this.target;
    }
    /**
     * 确保运行时就位：版本匹配直接就绪；否则安装（忙时并 await 同一次任务）。
     * 返回是否就绪（失败/取消返回 false 并在 progress.error 说明原因）。
     */
    async ensure() {
        if (await this.isReady()) {
            this.progress.phase = 'ready';
            this.progress.installedVersion = this.target;
            return true;
        }
        if (this.current)
            return this.current;
        this.current = this.installOnce();
        try {
            return await this.current;
        }
        finally {
            this.current = null;
        }
    }
    /**
     * 取消安装（kill 子进程；node_modules 残留无害，npm 幂等重装）。
     * 间隙兼容：ci 退出到回退 install 起跑之间 child 为 null——此时也置取消态，
     * runNpm 起跑前复查即不再起新进程（否则回退的 npm 会跑到自然结束且无法再取消）。
     */
    cancel() {
        if (this.progress.phase !== 'installing')
            return false;
        this.progress.phase = 'cancelled';
        this.child?.kill();
        return true;
    }
    pushLine(line) {
        const lines = this.progress.lastLines;
        lines.push(line.length > 300 ? line.slice(0, 300) + '…' : line);
        if (lines.length > 5)
            lines.splice(0, lines.length - 5);
    }
    /** 跑一次 npm 子进程（采集尾行 + 超时 kill），返回退出码（null = 被杀死/启动失败）。 */
    async runNpm(args) {
        // 起跑前复查取消：cancel() 在上一进程退出与本进程 spawn 之间的间隙置位时，不再起新进程
        if (this.progress.phase === 'cancelled')
            return null;
        const child = this.spawnImpl('npm', args, this.runtimeDir);
        this.child = child;
        child.onStdout((l) => this.pushLine(l));
        child.onStderr((l) => this.pushLine(l));
        const timeout = setTimeout(() => {
            this.pushLine('安装超时（10 分钟），终止子进程');
            child.kill();
        }, RuntimeInstaller.INSTALL_TIMEOUT_MS);
        const code = await child.exited;
        clearTimeout(timeout);
        this.child = null;
        return code;
    }
    /** 取消态判定。独立方法而非内联比较：cancel() 在 await 期间跨方法置位
     *  phase，TS 的属性流分析不跟踪这种突变，内联比较会被窄化误报"无重叠"。 */
    wasCancelled() {
        return this.progress.phase === 'cancelled';
    }
    async installOnce() {
        // 锚定 package.json（带精确依赖）：没有它 npm 会向上层目录找最近的 package.json 安装（逃逸事故）；
        // npm ci 还要求它与 lockfile 根条目一致——每次安装都写规范化形状，覆盖历史遗留/被 npm 改写的副本。
        await fs.mkdir(this.runtimeDir, { recursive: true });
        const manifest = {
            name: 'dsh-memory-runtime',
            private: true,
            dependencies: { [RuntimeInstaller.packageName]: this.target },
        };
        await fs.writeFile(path.join(this.runtimeDir, 'package.json'), JSON.stringify(manifest, null, 2));
        this.progress = {
            phase: 'installing',
            targetVersion: this.target,
            installedVersion: await this.installedVersion(),
            startedAt: Date.now(),
            elapsedMs: 0,
            lastLines: [],
        };
        this.logger?.info(`[memory] 运行时安装开始: ${RuntimeInstaller.packageName}@${this.target} → ${this.runtimeDir}`);
        // 首选 npm ci + 随包 lockfile（传递依赖树冻结在作者侧）；lockfile 资产缺失（npm 包被裁剪等）
        // 或 ci 失败（lock 与锚定版本漂移等）回退 npm install 精确版本——可用性优先。
        let code = null;
        let usedCi = false;
        try {
            const lock = await fs.readFile(this.lockfileSource, 'utf8');
            await fs.writeFile(path.join(this.runtimeDir, 'package-lock.json'), lock);
            this.pushLine(`npm ci（随包 lockfile 锁定依赖树，@${this.target}，--ignore-scripts）`);
            usedCi = true;
            code = await this.runNpm(['ci', '--ignore-scripts', '--no-audit', '--no-fund', '--loglevel', 'notice']);
        }
        catch {
            /* 无随包 lockfile，直接走 install 回退 */
        }
        // ci 阶段被取消（退出码 null）不得落入回退分支——那是"ci 失败"语义，会让
        // 取消后再白跑一次最长 10 分钟的 install
        if (this.wasCancelled()) {
            this.progress.elapsedMs = Date.now() - this.progress.startedAt;
            this.logger?.warn('[memory] 运行时安装已取消（残留无害，重装幂等）');
            return false;
        }
        if (!usedCi || code !== 0) {
            if (usedCi) {
                this.pushLine('npm ci 失败（lockfile 与钉死版本漂移？），回退 npm install');
                this.logger?.warn('[memory] 运行时 npm ci 失败，回退 npm install（传递依赖不再受随包 lockfile 锁定）');
            }
            this.pushLine(`npm install ${RuntimeInstaller.packageName}@${this.target}（--ignore-scripts）`);
            code = await this.runNpm([
                'install',
                '--ignore-scripts',
                '--no-audit',
                '--no-fund',
                '--loglevel',
                'notice',
                `${RuntimeInstaller.packageName}@${this.target}`,
            ]);
        }
        this.progress.elapsedMs = Date.now() - this.progress.startedAt;
        const version = await this.installedVersion();
        this.progress.installedVersion = version;
        if (this.wasCancelled()) {
            this.logger?.warn('[memory] 运行时安装已取消（残留无害，重装幂等）');
            return false;
        }
        if (code === 0 && version === this.target) {
            this.progress.phase = 'ready';
            this.logger?.info(`[memory] 运行时安装完成: v${version}`);
            return true;
        }
        this.progress.phase = 'error';
        this.progress.error = `npm 退出码 ${code ?? '被杀死'}${version ? `（就位版本 ${version}）` : '（模块未就位）'}`;
        this.logger?.warn(`[memory] 运行时安装失败: ${this.progress.error}`);
        return false;
    }
}
