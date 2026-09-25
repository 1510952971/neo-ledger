part of '../../mobile_ledger_shell.dart';

class MobileAppLockPage extends StatefulWidget {
  const MobileAppLockPage({
    super.key,
    required this.controller,
    required this.onUnlocked,
  });

  final LedgerController controller;
  final VoidCallback onUnlocked;

  @override
  State<MobileAppLockPage> createState() => _MobileAppLockPageState();
}

class _MobileAppLockPageState extends State<MobileAppLockPage> {
  final _pin = TextEditingController();
  bool _verifying = false;
  String? _error;

  @override
  void dispose() {
    _pin.dispose();
    super.dispose();
  }

  Future<void> _unlock() async {
    if (_pin.text.trim().isEmpty || _verifying) return;
    setState(() {
      _verifying = true;
      _error = null;
    });
    try {
      final valid = await widget.controller.verifyPin(_pin.text);
      if (!mounted) return;
      if (valid) {
        widget.onUnlocked();
      } else {
        setState(() {
          _pin.clear();
          _error = 'PIN 不正确，请重试';
        });
      }
    } catch (error) {
      if (mounted) setState(() => _error = '暂时无法验证 PIN：$error');
    } finally {
      if (mounted) setState(() => _verifying = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: _mobileBg,
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 72,
                height: 72,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: _mobileBrand.withAlpha(30),
                ),
                child: Icon(
                  Icons.lock_outline_rounded,
                  color: _mobileBrand,
                  size: 36,
                ),
              ),
              const SizedBox(height: 18),
              const Text(
                'Neo Ledger 已锁定',
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 8),
              Text('输入账本隐私锁 PIN 后继续使用', style: TextStyle(color: _mobileMuted)),
              const SizedBox(height: 24),
              TextField(
                controller: _pin,
                autofocus: true,
                obscureText: true,
                keyboardType: TextInputType.number,
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => _unlock(),
                decoration: InputDecoration(
                  labelText: 'PIN',
                  errorText: _error,
                  prefixIcon: const Icon(Icons.password_rounded),
                ),
              ),
              const SizedBox(height: 14),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _verifying ? null : _unlock,
                  child: _verifying
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('解锁'),
                ),
              ),
              const SizedBox(height: 8),
              TextButton(
                onPressed: () =>
                    _confirmMobileLogout(context, widget.controller),
                child: const Text('退出当前账号'),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

class MobileLoginPage extends StatefulWidget {
  const MobileLoginPage({super.key, required this.controller});

  final LedgerController controller;

  @override
  State<MobileLoginPage> createState() => _MobileLoginPageState();
}

class _MobileLoginPageState extends State<MobileLoginPage> {
  final _username = TextEditingController();
  final _password = TextEditingController();
  bool _obscure = true;

  @override
  void dispose() {
    _username.dispose();
    _password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = widget.controller;
    return Scaffold(
      backgroundColor: _mobileBg,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(24, 60, 24, 28),
          children: [
            const _MobileBrandMark(),
            const SizedBox(height: 28),
            Text(
              '把每一笔生活，\n记得更轻松',
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                color: _mobileText,
                fontWeight: FontWeight.w800,
                height: 1.18,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              '移动端使用原生交互，数据仍与网页、Windows 和 macOS 共用同一账本。',
              style: TextStyle(color: _mobileMuted, height: 1.6),
            ),
            const SizedBox(height: 32),
            _MobileTextField(
              controller: _username,
              label: '账号或邮箱',
              icon: Icons.person_outline_rounded,
              textInputAction: TextInputAction.next,
            ),
            const SizedBox(height: 14),
            _MobileTextField(
              controller: _password,
              label: '密码',
              icon: Icons.lock_outline_rounded,
              obscureText: _obscure,
              suffix: IconButton(
                tooltip: _obscure ? '显示密码' : '隐藏密码',
                onPressed: () => setState(() => _obscure = !_obscure),
                icon: Icon(
                  _obscure
                      ? Icons.visibility_outlined
                      : Icons.visibility_off_outlined,
                  color: _mobileMuted,
                ),
              ),
              onSubmitted: (_) => _login(),
            ),
            if (controller.error != null) ...[
              const SizedBox(height: 14),
              MobileInlineError(message: controller.error!),
            ],
            const SizedBox(height: 22),
            SizedBox(
              height: 54,
              child: FilledButton(
                onPressed: controller.loading ? null : _login,
                style: FilledButton.styleFrom(
                  backgroundColor: _mobileBrand,
                  foregroundColor: _mobileOnBrand,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(18),
                  ),
                ),
                child: controller.loading
                    ? const SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text(
                        '登录 Neo Ledger',
                        style: TextStyle(fontWeight: FontWeight.w800),
                      ),
              ),
            ),
            const SizedBox(height: 14),
            OutlinedButton.icon(
              onPressed: controller.loading ? null : controller.loadDemo,
              icon: const Icon(Icons.auto_awesome_outlined),
              label: const Text('先体验原生移动端'),
              style: OutlinedButton.styleFrom(
                foregroundColor: _mobileText,
                side: BorderSide(color: _mobileLine),
                minimumSize: const Size.fromHeight(50),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(18),
                ),
              ),
            ),
            const SizedBox(height: 26),
            Text(
              '登录地址已固定为 ledger.eyeme.online。首次使用请先在网页端注册账号。',
              textAlign: TextAlign.center,
              style: TextStyle(color: _mobileMuted, fontSize: 12, height: 1.5),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _login() async {
    final username = _username.text.trim();
    if (username.isEmpty || _password.text.isEmpty) {
      widget.controller.clearError();
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('请输入账号和密码')));
      return;
    }
    await widget.controller.login(
      url: 'https://ledger.eyeme.online',
      username: username,
      password: _password.text,
    );
  }
}
