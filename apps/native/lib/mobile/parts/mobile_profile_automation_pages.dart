part of '../../mobile_ledger_shell.dart';

class MobileProfilePage extends StatelessWidget {
  const MobileProfilePage({
    super.key,
    required this.controller,
    required this.nativeVersion,
  });

  final LedgerController controller;
  final String nativeVersion;

  @override
  Widget build(BuildContext context) {
    final user = controller.user;
    final accountAssets = controller.accounts
        .where((item) => item.type == '资产')
        .fold<int>(0, (sum, item) => sum + item.balanceCents);
    final liabilityTotal = controller.accounts
        .where((item) => item.type == '负债')
        .fold<int>(0, (sum, item) => sum + item.balanceCents.abs());
    final digitalAssetTotal = controller.assets.fold<int>(
      0,
      (sum, item) => sum + (item.currentValueCents ?? item.valueCents),
    );
    return _MobilePage(
      controller: controller,
      title: '我的',
      child: ListView(
        padding: const EdgeInsets.fromLTRB(18, 8, 18, 110),
        children: [
          _ProfileHeader(user: user, onAvatarTap: () => _pickAvatar(context)),
          const SizedBox(height: 16),
          _NetWorthCard(
            assetTotal: accountAssets + digitalAssetTotal,
            liabilityTotal: liabilityTotal,
            ledgerName: controller.selectedLedger?.name ?? '日常账本',
            hideAmounts: controller.preferences.hideAmounts,
          ),
          const SizedBox(height: 14),
          _SettingsRow(
            icon: '👤',
            title: '账号资料',
            subtitle: '${user?.username ?? '未登录'} · ${user?.email ?? '尚未绑定邮箱'}',
            onTap: () => showModalBottomSheet<void>(
              context: context,
              isScrollControlled: true,
              showDragHandle: true,
              backgroundColor: _mobileSurface,
              builder: (_) => ProfileAccountSheet(controller: controller),
            ),
          ),
          const SizedBox(height: 22),
          _SectionHeader(
            title: '我的账本',
            action: '${controller.ledgers.length} 个',
          ),
          const SizedBox(height: 10),
          ...controller.ledgers.map(
            (ledger) => _SettingsRow(
              icon: ledger.icon,
              title: ledger.name,
              subtitle: ledger.id == controller.selectedLedger?.id
                  ? '当前使用中'
                  : '切换账本',
              onTap: () async {
                final index = controller.ledgers.indexOf(ledger);
                if (index >= 0) await controller.selectLedger(index);
              },
            ),
          ),
          const SizedBox(height: 16),
          _SectionHeader(title: '应用', action: 'v$nativeVersion'),
          const SizedBox(height: 10),
          _SettingsRow(
            icon: '☁️',
            title: '同步状态',
            subtitle: controller.totalPendingCount == 0
                ? '已与云端同步'
                : '${controller.totalPendingCount} 笔待同步',
          ),
          _SettingsRow(
            icon: '🧩',
            title: '高级功能',
            subtitle: '预算、订阅、分期与储蓄目标',
            onTap: () => MobileRouteRegistry.push<void>(
              context,
              MobileRouteName.planning,
            ),
          ),
          _SettingsRow(
            icon: '💳',
            title: '账户与资产',
            subtitle:
                '${controller.accounts.length} 个账户 · ${controller.assets.length} 项资产',
            onTap: () => MobileRouteRegistry.push<void>(
              context,
              MobileRouteName.accounts,
            ),
          ),
          _SettingsRow(
            icon: '✨',
            title: '记账体验',
            subtitle: '触觉反馈、连续记账与快捷输入',
            onTap: () => showModalBottomSheet<void>(
              context: context,
              showDragHandle: true,
              backgroundColor: _mobileSurface,
              builder: (_) => _MobileExperienceSettings(controller: controller),
            ),
          ),
          _SettingsRow(
            icon: '🧭',
            title: '首页模块',
            subtitle: '开启、关闭和排序首页卡片，设置会跨设备同步',
            onTap: () => showModalBottomSheet<void>(
              context: context,
              isScrollControlled: true,
              showDragHandle: true,
              backgroundColor: _mobileSurface,
              builder: (_) => _MobileHomeModuleSettings(controller: controller),
            ),
          ),
          _SettingsRow(
            icon: '🔒',
            title: '隐私与安全',
            subtitle: controller.preferences.lockEnabled
                ? '已开启应用锁'
                : '数据仅通过加密连接同步',
            onTap: () => showModalBottomSheet<void>(
              context: context,
              isScrollControlled: true,
              showDragHandle: true,
              backgroundColor: _mobileSurface,
              builder: (_) => SecuritySheet(controller: controller),
            ),
          ),
          _SettingsRow(
            icon: '📱',
            title: '登录设备与安全审计',
            subtitle: '查看登录会话、撤销陌生设备和近期安全事件',
            onTap: () => showModalBottomSheet<void>(
              context: context,
              isScrollControlled: true,
              showDragHandle: true,
              backgroundColor: _mobileSurface,
              builder: (_) => SecuritySessionsSheet(controller: controller),
            ),
          ),
          _SettingsRow(
            icon: '🛡️',
            title: '二次验证',
            subtitle: '配置验证器动态码与一次性恢复码',
            onTap: () => showModalBottomSheet<void>(
              context: context,
              isScrollControlled: true,
              showDragHandle: true,
              backgroundColor: _mobileSurface,
              builder: (_) => MobileMfaSettingsSheet(api: controller.api),
            ),
          ),
          _SettingsRow(
            icon: '🧾',
            title: '隐私诊断',
            subtitle: '查看并自行复制不含财务内容的 API 错误摘要',
            onTap: () => showModalBottomSheet<void>(
              context: context,
              isScrollControlled: true,
              showDragHandle: true,
              builder: (_) => MobileDiagnosticsSheet(
                appVersion: nativeVersion,
                platform: Theme.of(context).platform.name,
              ),
            ),
          ),
          _SettingsRow(
            icon: '⚡️',
            title: '自动记账与导入',
            subtitle: 'Android 自动记账、自动化规则与账单导入',
            onTap: () => MobileRouteRegistry.push<void>(
              context,
              MobileRouteName.automation,
            ),
          ),
          _SettingsRow(
            icon: '🗂️',
            title: '分类管理',
            subtitle: '维护支出与收入分类，历史流水保持不变',
            onTap: () => showModalBottomSheet<void>(
              context: context,
              isScrollControlled: true,
              showDragHandle: true,
              backgroundColor: _mobileSurface,
              builder: (_) => CategoryManagerSheet(controller: controller),
            ),
          ),
          _SettingsRow(
            icon: '#️⃣',
            title: '标签词库',
            subtitle: '重命名或从当前账本流水中移除标签',
            onTap: controller.selectedLedger == null
                ? null
                : () => showModalBottomSheet<void>(
                    context: context,
                    isScrollControlled: true,
                    showDragHandle: true,
                    backgroundColor: _mobileSurface,
                    builder: (_) => MobileTagManagerSheet(
                      api: controller.api,
                      ledgerId: controller.selectedLedger!.id,
                    ),
                  ),
          ),
          _SettingsRow(
            icon: '🛡️',
            title: '数据与备份',
            subtitle: '导出、恢复、预检和同步待处理流水',
            onTap: () => showModalBottomSheet<void>(
              context: context,
              isScrollControlled: true,
              showDragHandle: true,
              backgroundColor: _mobileSurface,
              builder: (_) => DataCenterSheet(controller: controller),
            ),
          ),
          const SizedBox(height: 18),
          OutlinedButton.icon(
            onPressed: controller.loading
                ? null
                : () => _confirmMobileLogout(context, controller),
            icon: const Icon(Icons.logout_rounded),
            label: const Text('退出当前账号'),
            style: OutlinedButton.styleFrom(
              foregroundColor: _mobileExpense,
              side: const BorderSide(color: Color(0x55ff8a7a)),
              minimumSize: const Size.fromHeight(52),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _pickAvatar(BuildContext context) async {
    final action = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      backgroundColor: _mobileSurface,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('从相册选择'),
              onTap: () => Navigator.pop(context, 'pick'),
            ),
            if (controller.user?.avatarUrl != null)
              ListTile(
                leading: const Icon(Icons.delete_outline_rounded),
                title: const Text('删除头像'),
                onTap: () => Navigator.pop(context, 'remove'),
              ),
          ],
        ),
      ),
    );
    if (!context.mounted || action == null) return;
    if (action == 'remove') {
      try {
        await controller.updateAvatar(null);
      } catch (error) {
        if (context.mounted) {
          ScaffoldMessenger.of(context)
              .showSnackBar(SnackBar(content: Text('删除头像失败：$error')));
        }
      }
      return;
    }
    PlatformFile? file;
    try {
      // Use an explicit allow-list instead of FileType.image. On some desktop
      // and Android picker implementations the broad type filter returns an
      // unsupported provider result and the native picker can terminate the
      // process before Flutter receives a normal error.
      file = await FilePicker.pickFile(
        type: FileType.custom,
        allowedExtensions: const ['jpg', 'jpeg', 'png', 'webp'],
      );
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('打开图片选择器失败：$error')));
      }
      return;
    }
    if (!context.mounted || file == null) return;
    late final int selectedSize;
    try {
      selectedSize = await file.length();
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('读取图片信息失败：$error')));
      }
      return;
    }
    if (!context.mounted) return;
    if (selectedSize > 20 * 1024 * 1024) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('所选图片超过 20 MB，请先缩小图片再试')));
      return;
    }
    late final List<int> bytes;
    try {
      bytes = await file.readAsBytes();
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('读取头像失败：$error')));
      }
      return;
    }
    if (!context.mounted) return;
    if (bytes.isEmpty) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('无法读取所选图片')));
      return;
    }
    if (bytes.length > 20 * 1024 * 1024) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('所选图片超过 20 MB，请先缩小图片再试')));
      return;
    }
    final extension = (file.extension ?? '').toLowerCase();
    final mime = switch (extension) {
      'png' => 'image/png',
      'webp' => 'image/webp',
      'jpg' || 'jpeg' || '' => 'image/jpeg',
      _ => null,
    };
    if (mime == null) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('请选择 JPG、PNG 或 WebP 图片')));
      return;
    }
    final cropped = await showAvatarCropSheet(
      context,
      Uint8List.fromList(bytes),
    );
    if (!context.mounted || cropped == null) return;
    try {
      await controller.updateAvatar(
        'data:image/jpeg;base64,${base64Encode(cropped)}',
      );
    } catch (error) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('上传头像失败：$error')));
      }
    }
  }
}

class ProfileAccountSheet extends StatefulWidget {
  const ProfileAccountSheet({required this.controller, super.key});

  final LedgerController controller;

  @override
  State<ProfileAccountSheet> createState() => _ProfileAccountSheetState();
}

class _ProfileAccountSheetState extends State<ProfileAccountSheet> {
  late final TextEditingController displayName;
  late final TextEditingController email;
  late final TextEditingController code;
  late final TextEditingController password;
  bool savingName = false;
  bool requestingCode = false;
  bool savingEmail = false;

  @override
  void initState() {
    super.initState();
    final user = widget.controller.user;
    displayName = TextEditingController(text: user?.displayName ?? '');
    email = TextEditingController(text: user?.email ?? '');
    code = TextEditingController();
    password = TextEditingController();
  }

  @override
  void dispose() {
    displayName.dispose();
    email.dispose();
    code.dispose();
    password.dispose();
    super.dispose();
  }

  void _notify(String text) {
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));
    }
  }

  Future<void> _saveDisplayName() async {
    setState(() => savingName = true);
    try {
      await widget.controller.updateDisplayName(displayName.text);
      _notify('昵称已更新');
    } catch (error) {
      _notify('更新昵称失败：$error');
    } finally {
      if (mounted) setState(() => savingName = false);
    }
  }

  Future<void> _requestCode() async {
    final target = email.text.trim();
    if (!target.contains('@')) {
      _notify('请先输入有效邮箱地址');
      return;
    }
    setState(() => requestingCode = true);
    try {
      await widget.controller.requestEmailCode(
        url: widget.controller.api.baseUrl,
        email: target,
        purpose: 'bind',
      );
      _notify('验证码已发送，请检查邮箱');
    } catch (error) {
      _notify('发送验证码失败：$error');
    } finally {
      if (mounted) setState(() => requestingCode = false);
    }
  }

  Future<void> _bindEmail() async {
    final target = email.text.trim();
    if (!target.contains('@') || code.text.trim().isEmpty) {
      _notify('请输入有效邮箱和验证码');
      return;
    }
    setState(() => savingEmail = true);
    try {
      final user = widget.controller.user;
      await widget.controller.bindAccountEmail(
        email: target,
        code: code.text,
        currentPassword: (user?.passwordEnabled ?? false)
            ? password.text
            : null,
        newPassword: (user?.passwordEnabled ?? false) ? null : password.text,
      );
      password.clear();
      code.clear();
      _notify('邮箱已验证并绑定');
    } catch (error) {
      _notify('绑定邮箱失败：$error');
    } finally {
      if (mounted) setState(() => savingEmail = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = widget.controller.user;
    final linked = <String>[
      if (user?.passwordEnabled ?? false) '密码登录',
      for (final provider in user?.linkedProviders ?? const <String>[])
        switch (provider) {
          'wechat' => '微信',
          'alipay' => '支付宝',
          _ => provider,
        },
    ];
    final registered = DateTime.tryParse(user?.createdAt ?? '')?.toLocal();
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(
          20,
          8,
          20,
          MediaQuery.viewInsetsOf(context).bottom + 28,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('账号资料', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 14),
            _SettingsRow(
              icon: '📒',
              title: '当前账本',
              subtitle: widget.controller.selectedLedger?.name ?? '暂无账本',
            ),
            _SettingsRow(
              icon: '🗓️',
              title: '注册日期',
              subtitle: registered == null
                  ? '服务器未提供注册日期'
                  : DateFormat('yyyy-MM-dd').format(registered),
            ),
            _SettingsRow(
              icon: '🔐',
              title: '登录方式',
              subtitle: linked.isEmpty ? '账号密码' : linked.join('、'),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: displayName,
              maxLength: 40,
              textInputAction: TextInputAction.done,
              decoration: const InputDecoration(
                labelText: '昵称',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 8),
            FilledButton.icon(
              onPressed: savingName ? null : _saveDisplayName,
              icon: savingName
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.save_outlined),
              label: Text(savingName ? '保存中…' : '保存昵称'),
            ),
            const SizedBox(height: 22),
            Text('邮箱绑定', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(
              user?.passwordEnabled == true
                  ? '更换邮箱需验证码和当前密码。'
                  : '绑定邮箱后需设置一个用于邮箱登录的新密码。',
              style: TextStyle(color: _mobileMuted),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: email,
              keyboardType: TextInputType.emailAddress,
              autofillHints: const [AutofillHints.email],
              decoration: const InputDecoration(
                labelText: '邮箱地址',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: code,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: '邮箱验证码',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                OutlinedButton(
                  onPressed: requestingCode ? null : _requestCode,
                  child: Text(requestingCode ? '发送中…' : '发送验证码'),
                ),
              ],
            ),
            const SizedBox(height: 8),
            TextField(
              controller: password,
              obscureText: true,
              autofillHints: [
                user?.passwordEnabled == true
                    ? AutofillHints.password
                    : AutofillHints.newPassword,
              ],
              decoration: InputDecoration(
                labelText: user?.passwordEnabled == true ? '当前密码' : '邮箱登录密码',
                helperText: user?.passwordEnabled == true
                    ? null
                    : '首次绑定需设置 8—72 位密码',
                border: const OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 10),
            FilledButton.icon(
              onPressed: savingEmail ? null : _bindEmail,
              icon: savingEmail
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.mark_email_read_outlined),
              label: Text(savingEmail ? '验证中…' : '验证并绑定邮箱'),
            ),
          ],
        ),
      ),
    );
  }
}

class MobileAutomationPage extends StatefulWidget {
  const MobileAutomationPage({super.key, required this.controller});

  final LedgerController controller;

  @override
  State<MobileAutomationPage> createState() => _MobileAutomationPageState();
}

class _MobileAutomationPageState extends State<MobileAutomationPage> {
  final _screenshotOcr = PlatformMobileScreenshotOcr();
  Map<String, dynamic> status = const {};
  bool loading = false;
  bool actionBusy = false;
  bool screenshotBusy = false;

  @override
  void initState() {
    super.initState();
    _refreshStatus();
  }

  Future<void> _refreshStatus() async {
    if (!widget.controller.isAndroid || loading) return;
    setState(() => loading = true);
    try {
      final next = await widget.controller.androidCaptureStatus();
      if (mounted) setState(() => status = next);
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('读取自动记账状态失败：$error')));
      }
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _systemAction(
    String label,
    Future<void> Function() action,
  ) async {
    if (actionBusy) return;
    setState(() => actionBusy = true);
    try {
      await action();
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('$label失败：$error')));
      }
    } finally {
      if (mounted) setState(() => actionBusy = false);
    }
  }

  Future<void> _recognizeScreenshot() async {
    if (screenshotBusy) return;
    PlatformFile? file;
    try {
      file = await FilePicker.pickFile(
        type: FileType.custom,
        allowedExtensions: const ['jpg', 'jpeg', 'png', 'webp'],
      );
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('打开图片选择器失败：$error')));
      }
      return;
    }
    if (!mounted || file == null) return;
    late final int selectedSize;
    try {
      selectedSize = await file.length();
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('读取图片信息失败：$error')));
      }
      return;
    }
    if (!mounted) return;
    if (selectedSize > 20 * 1024 * 1024) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('图片超过 20 MB，请先缩小图片再试')));
      return;
    }

    setState(() => screenshotBusy = true);
    try {
      final bytes = await file.readAsBytes();
      if (bytes.length > 20 * 1024 * 1024) {
        throw const FormatException('图片超过 20 MB，请先缩小图片再试');
      }
      final text = await _screenshotOcr.recognize(bytes);
      if (!mounted) return;
      final extracted = parseMobileScreenshotText(text);
      final draft = await showModalBottomSheet<ShortcutEntryDraft>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        showDragHandle: true,
        backgroundColor: _mobileSurface,
        builder: (_) => _ScreenshotRecognitionReviewSheet(
          result: extracted,
          imageBytes: bytes,
          api: widget.controller.api,
          expenseCategories: widget.controller.expenseCategories
              .where((item) => item.isActive)
              .map((item) => item.name)
              .toList(),
          incomeCategories: widget.controller.incomeCategories
              .where((item) => item.isActive)
              .map((item) => item.name)
              .toList(),
        ),
      );
      if (!mounted || draft == null) return;
      await MobileRouteRegistry.push<void>(
        context,
        MobileRouteName.entry,
        arguments: draft,
      );
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('截图识别失败：$error')));
      }
    } finally {
      if (mounted) setState(() => screenshotBusy = false);
    }
  }

  void _openSheet(Widget child) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      backgroundColor: _mobileSurface,
      builder: (_) => child,
    );
  }

  Widget _statusLine(String label, bool enabled) {
    return Row(
      children: [
        Icon(
          enabled ? Icons.check_circle_rounded : Icons.radio_button_unchecked,
          size: 18,
          color: enabled ? _mobileIncome : _mobileMuted,
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            label,
            style: TextStyle(
              color: enabled ? _mobileText : _mobileMuted,
              fontSize: 13,
            ),
          ),
        ),
      ],
    );
  }

  Widget _card({required Widget child}) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: _mobileBoxDecoration(),
      child: child,
    );
  }

  @override
  Widget build(BuildContext context) {
    final android = widget.controller.isAndroid;
    final configured = status['configured'] == true;
    final notificationEnabled = status['notificationEnabled'] == true;
    final accessibilityEnabled = status['accessibilityEnabled'] == true;
    final pending = (status['pending'] as num?)?.toInt() ?? 0;
    final rulesCount = widget.controller.automationRules.length;

    return _MobilePage(
      controller: widget.controller,
      title: '自动记账与导入',
      trailing: IconButton(
        tooltip: '刷新状态',
        onPressed: loading ? null : _refreshStatus,
        icon: Icon(Icons.refresh_rounded, color: _mobileMuted),
      ),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(18, 8, 18, 36),
        children: [
          _card(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '自动记账',
                  style: TextStyle(
                    color: _mobileText,
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  android
                      ? '只在你授权的通知和无障碍范围内识别支付结果，数据仍写入当前账本。'
                      : 'Android 支付识别需要系统级权限；其他平台可使用统一的自动化规则和账单导入。',
                  style: TextStyle(color: _mobileMuted, height: 1.45),
                ),
                const SizedBox(height: 16),
                if (android) ...[
                  _statusLine('连接配置', configured),
                  const SizedBox(height: 9),
                  _statusLine('通知使用权', notificationEnabled),
                  const SizedBox(height: 9),
                  _statusLine('无障碍服务', accessibilityEnabled),
                  const SizedBox(height: 9),
                  _statusLine('待发送账单：$pending 条', pending == 0),
                  const SizedBox(height: 14),
                  FilledButton.icon(
                    onPressed: actionBusy
                        ? null
                        : () => _openSheet(
                            SettingsSheet(controller: widget.controller),
                          ),
                    icon: const Icon(Icons.tune_rounded),
                    label: const Text('打开自动记账配置'),
                  ),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: actionBusy
                        ? null
                        : () => _systemAction(
                            '打开通知使用权设置',
                            widget.controller.openAndroidNotificationSettings,
                          ),
                    icon: const Icon(Icons.notifications_outlined),
                    label: const Text('通知使用权'),
                  ),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: actionBusy
                        ? null
                        : () => _systemAction(
                            '打开无障碍设置',
                            widget.controller.openAndroidAccessibilitySettings,
                          ),
                    icon: const Icon(Icons.accessibility_new_rounded),
                    label: const Text('无障碍服务'),
                  ),
                ] else
                  Text(
                    '当前设备不提供 Android 系统支付识别权限。iOS/iPadOS 也不能在后台读取其他应用的通知或界面，需要通过系统分享、剪贴板或文件导入主动提交内容。你仍可以使用下面的规则、导入和备份能力，数据与桌面端保持一致。',
                    style: TextStyle(color: _mobileMuted, height: 1.45),
                  ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          _SettingsRow(
            icon: screenshotBusy ? '⏳' : '📷',
            title: screenshotBusy ? '正在本机识别截图…' : '截图识别记账',
            subtitle: '图片不会上传；检查并确认后预填到记账页',
            onTap: screenshotBusy ? null : _recognizeScreenshot,
          ),
          const SizedBox(height: 8),
          Text(
            '本机 OCR 只负责提取文字；敏感信息会在预览中遮蔽。金额、分类和日期需由你检查，确认后仍进入标准记账流程。',
            style: TextStyle(color: _mobileMuted, fontSize: 12, height: 1.5),
          ),
          const SizedBox(height: 14),
          _SettingsRow(
            icon: '🧠',
            title: '自动化规则',
            subtitle: '$rulesCount 条规则 · 商户、金额和分类自动匹配',
            onTap: () =>
                _openSheet(AutomationRulesSheet(controller: widget.controller)),
          ),
          _SettingsRow(
            icon: '📥',
            title: '导入账单',
            subtitle: '支持 JSON、CSV，先预览检查再写入',
            onTap: () => _openSheet(ImportSheet(controller: widget.controller)),
          ),
          _SettingsRow(
            icon: '🗄️',
            title: '备份与恢复',
            subtitle: '生成完整备份，并支持恢复预检',
            onTap: () =>
                _openSheet(DataCenterSheet(controller: widget.controller)),
          ),
          const SizedBox(height: 16),
          Text(
            '隐私说明：自动记账只处理被授权的支付通知或无障碍事件；账单导入会先解析并展示预览，确认后才提交到当前账本。',
            style: TextStyle(color: _mobileMuted, fontSize: 12, height: 1.5),
          ),
        ],
      ),
    );
  }
}

class _ScreenshotRecognitionReviewSheet extends StatefulWidget {
  const _ScreenshotRecognitionReviewSheet({
    required this.result,
    required this.imageBytes,
    required this.api,
    required this.expenseCategories,
    required this.incomeCategories,
  });

  final MobileScreenshotRecognition result;
  final Uint8List imageBytes;
  final NeoLedgerApi api;
  final List<String> expenseCategories;
  final List<String> incomeCategories;

  @override
  State<_ScreenshotRecognitionReviewSheet> createState() =>
      _ScreenshotRecognitionReviewSheetState();
}

class _ScreenshotRecognitionReviewSheetState
    extends State<_ScreenshotRecognitionReviewSheet> {
  late final TextEditingController _amount;
  late final TextEditingController _title;
  late DateTime _occurredAt;
  late String _type;
  late String _category;
  bool _aiBusy = false;

  List<String> get _categories {
    final values = _type == '收入'
        ? widget.incomeCategories
        : widget.expenseCategories;
    return values.isEmpty ? const ['其他'] : values;
  }

  @override
  void initState() {
    super.initState();
    final result = widget.result;
    _amount = TextEditingController(
      text: result.amount?.toStringAsFixed(2) ?? '',
    );
    _title = TextEditingController(text: result.merchant ?? '');
    _occurredAt = result.occurredAt ?? DateTime.now();
    _type = result.type;
    _category = _categories.first;
  }

  @override
  void dispose() {
    _amount.dispose();
    _title.dispose();
    super.dispose();
  }

  void _continueToEntry() {
    final amount = double.tryParse(_amount.text.trim());
    if (amount == null ||
        !amount.isFinite ||
        amount <= 0 ||
        amount > 100000000) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('请检查并填写有效金额')));
      return;
    }
    Navigator.pop(
      context,
      ShortcutEntryDraft(
        amount: amount,
        title: _title.text.trim().isEmpty ? '截图识别账单' : _title.text.trim(),
        category: _category,
        type: _type,
        occurredAt: _occurredAt,
        source: '截图本地识别',
        recognitionText: widget.result.redactedText,
        recognitionCompleteness: widget.result.fieldCompleteness,
        recognizedFields: {
          if (widget.result.amount != null) 'amount': widget.result.amount,
          if (widget.result.merchant != null) 'title': widget.result.merchant,
          'type': widget.result.type,
          if (widget.result.occurredAt != null)
            'occurredAt': widget.result.occurredAt!.toIso8601String(),
        },
      ),
    );
  }

  Future<void> _requestAiCorrection() async {
    if (_aiBusy || widget.result.redactedText.trim().isEmpty) return;
    final consent = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('发送脱敏文本进行 AI 校正？'),
        content: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                '仅本次发送下方脱敏后的 OCR 文字到管理员配置的 Ollama 模型。不会发送原图、原始 OCR、账本编号或账本汇总；模型建议仍需你检查，不会自动记账。',
              ),
              const SizedBox(height: 12),
              SelectableText(
                widget.result.redactedText,
                style: TextStyle(color: _mobileMuted, height: 1.4),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('同意并发送'),
          ),
        ],
      ),
    );
    if (consent != true || !mounted) return;
    setState(() => _aiBusy = true);
    try {
      final suggestions = await widget.api.recognizeScreenshotTextWithAi(
        widget.result.redactedText,
      );
      if (!mounted) return;
      setState(() {
        final amount = double.tryParse('${suggestions['amount'] ?? ''}');
        if (amount != null && amount > 0 && amount <= 100000000) {
          _amount.text = amount.toStringAsFixed(2);
        }
        final title = suggestions['title'];
        if (title is String && title.trim().isNotEmpty) _title.text = title;
        final type = suggestions['type'];
        if (type == '支出' || type == '收入') {
          _type = type as String;
          _category = _categories.first;
        }
        final category = suggestions['category'];
        if (category is String && _categories.contains(category)) {
          _category = category;
        }
        final occurredAt = suggestions['occurredAt'];
        if (occurredAt is String) {
          final parsed = DateTime.tryParse(occurredAt);
          if (parsed != null) _occurredAt = parsed;
        }
      });
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('AI 建议已填入，请逐项检查后再继续')));
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('AI 校正失败：$error')));
      }
    } finally {
      if (mounted) setState(() => _aiBusy = false);
    }
  }

  Future<void> _selectDate() async {
    final selected = await showDatePicker(
      context: context,
      initialDate: _occurredAt,
      firstDate: DateTime(2000),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (selected != null && mounted) {
      setState(
        () => _occurredAt = DateTime(
          selected.year,
          selected.month,
          selected.day,
          _occurredAt.hour,
          _occurredAt.minute,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final result = widget.result;
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * .88,
        ),
        child: SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(20, 4, 20, 20 + bottomInset),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                '检查识别结果',
                style: TextStyle(fontSize: 21, fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 6),
              Text(
                '字段完整度 ${result.fieldCompleteness}%（不是模型置信度）。所有字段都可修改；确认后只预填，不会自动保存。',
                style: TextStyle(color: _mobileMuted, height: 1.45),
              ),
              const SizedBox(height: 14),
              ClipRRect(
                borderRadius: BorderRadius.circular(14),
                child: ColoredBox(
                  color: _mobileBg,
                  child: Image.memory(
                    widget.imageBytes,
                    height: 180,
                    width: double.infinity,
                    fit: BoxFit.contain,
                    cacheWidth: 1200,
                    errorBuilder: (_, _, _) => const SizedBox(
                      height: 120,
                      child: Center(child: Text('图片预览不可用，仍可检查识别字段')),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Text(
                '原图仅在本机临时预览，不会上传或保存到 Neo Ledger。',
                style: TextStyle(color: _mobileMuted, fontSize: 12),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: _amount,
                keyboardType: const TextInputType.numberWithOptions(
                  decimal: true,
                ),
                decoration: const InputDecoration(
                  labelText: '金额',
                  prefixText: '¥ ',
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _title,
                decoration: const InputDecoration(labelText: '商户 / 标题'),
              ),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                initialValue: _categories.contains(_category)
                    ? _category
                    : _categories.first,
                decoration: const InputDecoration(labelText: '分类'),
                items: _categories
                    .map(
                      (value) =>
                          DropdownMenuItem(value: value, child: Text(value)),
                    )
                    .toList(),
                onChanged: (value) {
                  if (value != null) setState(() => _category = value);
                },
              ),
              const SizedBox(height: 12),
              SegmentedButton<String>(
                segments: const [
                  ButtonSegment(value: '支出', label: Text('支出')),
                  ButtonSegment(value: '收入', label: Text('收入')),
                ],
                selected: {_type},
                onSelectionChanged: (values) => setState(() {
                  _type = values.first;
                  if (!_categories.contains(_category)) {
                    _category = _categories.first;
                  }
                }),
              ),
              const SizedBox(height: 8),
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.calendar_month_outlined),
                title: const Text('交易日期'),
                subtitle: Text(DateFormat('yyyy年MM月dd日').format(_occurredAt)),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: _selectDate,
              ),
              if (result.typeWasInferred)
                Text(
                  '收支类型未从截图中明确识别，请确认上方选择。',
                  style: TextStyle(color: _mobileMuted, fontSize: 12),
                ),
              const SizedBox(height: 10),
              ExpansionTile(
                tilePadding: EdgeInsets.zero,
                title: const Text('本机识别原文（仅本机显示）'),
                children: [
                  Align(
                    alignment: Alignment.centerLeft,
                    child: SelectableText(
                      result.originalText.isEmpty
                          ? '（没有识别到文字）'
                          : result.originalText,
                      style: TextStyle(color: _mobileMuted, height: 1.5),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                '脱敏文本预览',
                style: TextStyle(color: _mobileMuted, fontSize: 12),
              ),
              const SizedBox(height: 4),
              SelectableText(
                result.redactedText.isEmpty ? '（没有识别到文字）' : result.redactedText,
                style: TextStyle(color: _mobileMuted, height: 1.5),
              ),
              const SizedBox(height: 18),
              OutlinedButton.icon(
                onPressed: _aiBusy ? null : _requestAiCorrection,
                icon: _aiBusy
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.auto_awesome_outlined),
                label: Text(_aiBusy ? '正在请求模型…' : 'AI 辅助校正（逐次确认）'),
              ),
              const SizedBox(height: 8),
              FilledButton.icon(
                onPressed: _continueToEntry,
                icon: const Icon(Icons.edit_note_rounded),
                label: const Text('确认并前往记账'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
