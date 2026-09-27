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
          _MobileCollapsibleSection(
            icon: Icons.palette_outlined,
            title: '外观与个性化',
            subtitle: '主题、首页模块、记账体验和成就徽章',
            child: Column(
              children: [
                _SettingsRow(
                  icon: '🎨',
                  title: '主题与外观',
                  subtitle:
                      '${_mobileThemeLabel(controller.preferences.theme)} · ${_mobileThemeModeLabel(controller.preferences.mobileThemeMode)}',
                  onTap: () => showModalBottomSheet<void>(
                    context: context,
                    isScrollControlled: true,
                    showDragHandle: true,
                    backgroundColor: _mobileSurface,
                    builder: (_) =>
                        MobileAppearanceSheet(controller: controller),
                  ),
                ),
                _SettingsRow(
                  icon: '🏆',
                  title: '成就徽章',
                  subtitle:
                      '${MobileAchievementSheet.unlockedCount(controller)}/${MobileAchievementSheet.totalCount} 已解锁 · 与桌面端同步',
                  onTap: () => showModalBottomSheet<void>(
                    context: context,
                    isScrollControlled: true,
                    showDragHandle: true,
                    backgroundColor: _mobileSurface,
                    builder: (_) =>
                        MobileAchievementSheet(controller: controller),
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
                    builder: (_) =>
                        _MobileExperienceSettings(controller: controller),
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
                    builder: (_) =>
                        _MobileHomeModuleSettings(controller: controller),
                  ),
                ),
              ],
            ),
          ),
          _MobileCollapsibleSection(
            icon: Icons.account_balance_wallet_outlined,
            title: '账本与数据',
            subtitle: '账本、账户资产、分类标签和备份恢复',
            child: Column(
              children: [
                _SettingsRow(
                  icon: '📚',
                  title: '我的账本',
                  subtitle:
                      '${controller.ledgers.length} 个账本 · 当前：${controller.selectedLedger?.name ?? '未选择'}',
                  onTap: () => showModalBottomSheet<void>(
                    context: context,
                    isScrollControlled: true,
                    useSafeArea: true,
                    showDragHandle: true,
                    backgroundColor: _mobileSurface,
                    builder: (_) =>
                        MobileLedgerManagerSheet(controller: controller),
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
                  icon: '🗂️',
                  title: '分类管理',
                  subtitle: '维护支出与收入分类，历史流水保持不变',
                  onTap: () => showModalBottomSheet<void>(
                    context: context,
                    isScrollControlled: true,
                    showDragHandle: true,
                    backgroundColor: _mobileSurface,
                    builder: (_) =>
                        CategoryManagerSheet(controller: controller),
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
              ],
            ),
          ),
          _MobileCollapsibleSection(
            icon: Icons.sync_rounded,
            title: '连接与同步',
            subtitle: '服务地址、同步状态和待处理队列',
            child: Column(
              children: [
                _SettingsRow(
                  icon: '🔗',
                  title: '连接与同步设置',
                  subtitle: '统一 API 地址与当前设备同步状态',
                  onTap: () => showModalBottomSheet<void>(
                    context: context,
                    isScrollControlled: true,
                    showDragHandle: true,
                    backgroundColor: _mobileSurface,
                    builder: (_) =>
                        MobileConnectionSyncSheet(controller: controller),
                  ),
                ),
                _SettingsRow(
                  icon: '☁️',
                  title: '当前同步状态',
                  subtitle: controller.totalPendingCount == 0
                      ? '已与云端同步'
                      : '${controller.totalPendingCount} 笔待同步或待确认',
                ),
              ],
            ),
          ),
          _MobileCollapsibleSection(
            icon: Icons.auto_awesome_outlined,
            title: '自动化与导入',
            subtitle: 'Android 自动记账、截图识别、规则和账单导入',
            child: Column(
              children: [
                _SettingsRow(
                  icon: '⚡️',
                  title: '自动记账与导入',
                  subtitle: '权限状态、截图识别、自动化规则与导入',
                  onTap: () => MobileRouteRegistry.push<void>(
                    context,
                    MobileRouteName.automation,
                  ),
                ),
                _SettingsRow(
                  icon: '🧩',
                  title: '规划与目标',
                  subtitle: '预算、订阅、周期记账、分期和储蓄目标',
                  onTap: () => MobileRouteRegistry.push<void>(
                    context,
                    MobileRouteName.planning,
                  ),
                ),
                _SettingsRow(
                  icon: '🧭',
                  title: '全部功能',
                  subtitle: '账单、资产、分析、规划和桌面端能力',
                  onTap: () => _showMobileFeatureHub(context, controller),
                ),
              ],
            ),
          ),
          _MobileCollapsibleSection(
            icon: Icons.shield_outlined,
            title: '隐私与安全',
            subtitle: '隐私锁、登录设备、二次验证与诊断',
            child: Column(
              children: [
                _SettingsRow(
                  icon: '🔒',
                  title: '隐私锁与安全设置',
                  subtitle: controller.preferences.lockEnabled
                      ? '已开启应用锁'
                      : '配置账本隐私锁和 PIN',
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
                    builder: (_) =>
                        SecuritySessionsSheet(controller: controller),
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
                    backgroundColor: _mobileSurface,
                    builder: (_) => MobileDiagnosticsSheet(
                      appVersion: nativeVersion,
                      platform: Theme.of(context).platform.name,
                    ),
                  ),
                ),
              ],
            ),
          ),
          _MobileCollapsibleSection(
            icon: Icons.tune_rounded,
            title: '应用',
            subtitle: '应用更新与版本信息 · v$nativeVersion',
            initiallyExpanded: false,
            child: Column(
              children: [
                _SettingsRow(
                  icon: '📖',
                  title: '操作手册',
                  subtitle: '按页面说明记账、管理账本、同步和更新',
                  onTap: () => showModalBottomSheet<void>(
                    context: context,
                    isScrollControlled: true,
                    showDragHandle: true,
                    backgroundColor: _mobileSurface,
                    builder: (_) => const MobileUserGuideSheet(),
                  ),
                ),
                _SettingsRow(
                  icon: '⬇️',
                  title: '检查版本更新',
                  subtitle: '服务地址优先，GitHub 自动备用下载',
                  onTap: () =>
                      _checkMobileUpdate(context, controller, nativeVersion),
                ),
              ],
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

class MobileLedgerManagerSheet extends StatefulWidget {
  const MobileLedgerManagerSheet({required this.controller, super.key});

  final LedgerController controller;

  @override
  State<MobileLedgerManagerSheet> createState() =>
      _MobileLedgerManagerSheetState();
}

class _MobileLedgerManagerSheetState extends State<MobileLedgerManagerSheet> {
  bool busy = false;

  Future<void> _openLedger([Ledger? existing]) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      backgroundColor: _mobileSurface,
      builder: (_) => LedgerSheet(
        controller: widget.controller,
        existing: existing,
        onDelete: existing == null ? null : () => _deleteLedger(existing),
      ),
    );
    if (mounted) setState(() {});
  }

  Future<void> _selectLedger(int index) async {
    setState(() => busy = true);
    try {
      await widget.controller.selectLedger(index);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('已切换账本')));
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('切换账本失败：$error')));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _deleteLedger(Ledger item) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('删除账本？'),
        content: Text('“${item.name}”及其账单、账户和规划数据将一起删除，此操作不可撤销。'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('删除'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    setState(() => busy = true);
    try {
      await widget.controller.deleteLedger(item);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('账本已删除')));
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('删除账本失败：$error')));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ledgers = widget.controller.ledgers;
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('我的账本', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 6),
            Text(
              '在这里统一切换、新建、编辑或删除账本；账本之间的流水、账户和规划数据相互隔离。',
              style: TextStyle(color: _mobileMuted, height: 1.45),
            ),
            const SizedBox(height: 14),
            for (var index = 0; index < ledgers.length; index++)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Material(
                  color: _mobileSurfaceRaised,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                    side: BorderSide(color: _mobileLine),
                  ),
                  child: ListTile(
                    enabled: !busy,
                    leading: Text(
                      ledgers[index].icon,
                      style: const TextStyle(fontSize: 25),
                    ),
                    title: Text(
                      ledgers[index].name,
                      style: const TextStyle(fontWeight: FontWeight.w800),
                    ),
                    subtitle: Text(
                      ledgers[index].id == widget.controller.selectedLedger?.id
                          ? '当前使用中'
                          : '点击切换账本',
                    ),
                    onTap: () => _selectLedger(index),
                    trailing: IconButton(
                      tooltip: '编辑账本',
                      onPressed: busy
                          ? null
                          : () => _openLedger(ledgers[index]),
                      icon: Icon(Icons.edit_outlined, color: _mobileMuted),
                    ),
                  ),
                ),
              ),
            const SizedBox(height: 4),
            FilledButton.icon(
              onPressed: busy ? null : () => _openLedger(),
              icon: const Icon(Icons.add_rounded),
              label: const Text('新建账本'),
            ),
          ],
        ),
      ),
    );
  }
}

class MobileUserGuideSheet extends StatelessWidget {
  const MobileUserGuideSheet({super.key});

  static const sections = <({String title, String text})>[
    (
      title: '侧边栏与一级页面',
      text: '手机端左侧是可收起的侧边栏：点击菜单图标展开名称，再点击首页、账单、分析或我的即可切换页面。侧边栏收起时仍可通过图标导航，绿色“+”始终用于快速记一笔。',
    ),
    (
      title: '首页',
      text: '首页展示当前账本、月度结余、预算进度、近期待办、最近账单和每日提示。点击眼睛图标可隐藏金额，点击铃铛查看通知，点击同步图标立即刷新服务端数据。',
    ),
    (
      title: '记一笔',
      text: '点击绿色“+”后选择支出、收入或转账。输入金额，选择分类、账户、日期、备注和标签；转账必须分别选择转出与转入账户。保存前检查币种和账户，保存后账户余额会同步变化。',
    ),
    (
      title: '账单',
      text: '账单页按月份浏览收支，可搜索商户、备注和分类。点开流水可查看详情、编辑或删除；修改和删除会自动重新计算相关账户余额。',
    ),
    (
      title: '分析',
      text: '分析页查看收入、支出、分类排行、趋势、预算执行、资产配置和财务健康指标。金额隐藏时图表也会隐藏具体数值；点击分类可回到对应账单。',
    ),
    (
      title: '我的账本',
      text: '进入“我的 → 账本与数据 → 我的账本”可以切换、新建、编辑和删除账本。账本是数据隔离的第一层，家庭、旅行和个人记录建议分别建立账本；删除前必须确认且至少保留一个账本。',
    ),
    (
      title: '账户与资产',
      text: '在“我的 → 账本与数据 → 账户与资产”维护现金、钱包、银行卡、信用卡和投资账户，也可以新增数字资产。资产账户为正向余额，负债账户用于记录欠款；停用账户不会删除历史流水。',
    ),
    (
      title: '分类与标签',
      text:
          '分类管理维护收入和支出分类；标签词库可以重命名或从当前账本流水中移除标签。历史流水保留原记录，删除分类前请先为仍在使用的流水重新分类。',
    ),
    (
      title: '预算',
      text: '在规划与目标中新增总预算或分类预算，设置周期和金额后，首页和分析页会显示已用、剩余和超支状态。预算只影响统计，不会限制实际记账。',
    ),
    (
      title: '订阅与周期记账',
      text: '订阅用于管理固定扣款；周期记账用于工资、房租等重复收入或支出。到期后系统生成待处理记录，确认前不会直接写入账本，暂停规则后不会补记暂停期间。',
    ),
    (
      title: '分期计划',
      text: '输入总金额、期数、还款日和付款账户后，系统按期生成计划。自动还款失败时先检查转出账户余额和账户状态，通知中的技术错误会在隐私诊断中保留。',
    ),
    (
      title: '储蓄目标',
      text: '为旅行、应急金等目标设置目标金额和截止日期。向目标贡献会记录资金去向并保留整体净资产变化，完成后可查看进度并继续管理。',
    ),
    (
      title: '自动记账',
      text: 'Android 自动记账只读取已授权的通知和支付完成界面，不会点击、输入或发起支付。先设置服务地址、通知使用权和无障碍服务，再发送测试账单；iOS 不支持后台读取其他应用通知。',
    ),
    (
      title: '截图识别与账单导入',
      text: '截图识别、CSV/JSON 导入都会先展示预览。确认金额、日期、账户、分类和重复项后再入账；原始截图只在本机 OCR 处理，敏感字段会在提交给 AI 前脱敏。',
    ),
    (
      title: '连接与同步',
      text: '公网统一使用 https://ledger.eyeme.online；localhost 只代表当前设备。连接异常时先检查地址、登录状态和网络，移动端会保留离线队列并在恢复网络后重试。',
    ),
    (
      title: '数据与备份',
      text: '数据与备份可以导出 JSON 全量备份、恢复备份和查看待处理同步。恢复会覆盖当前账号数据，必须先导出一份当前备份；升级或批量导入前也建议备份。',
    ),
    (
      title: '隐私锁与主题',
      text: '隐私与安全负责屏幕隐私锁、明暗模式、高对比度和默认币种。屏幕隐私锁只防止临时窥屏，不能替代账号密码、HTTPS 或磁盘加密。',
    ),
    (
      title: '登录设备、二次验证与诊断',
      text: '登录设备与安全审计可以查看会话并撤销陌生设备；二次验证使用验证器动态码和恢复码；隐私诊断只显示不含财务内容的 API 错误摘要，便于排查连接问题。',
    ),
    (
      title: '通知中心',
      text: '首页铃铛打开通知中心。通知只显示人类可读的处理结果，原始数据库错误不会作为主要文案展示；点击查看后会标记已读，红色数字表示未读数量，超过 99 条显示为 99+。',
    ),
    (
      title: '成就徽章',
      text: '外观与个性化 → 成就徽章展示与桌面端同步的 27 个成就、等级、图标和解锁状态。未解锁成就会显示条件，解锁后会保留图标和进度。',
    ),
    (
      title: '应用更新与安装包',
      text: '应用更新优先检查服务地址，失败时回退 GitHub；Android 会优先下载服务地址 APK，失败再使用 GitHub。网页版数据中心同时提供 Android、macOS、Windows 和 Web/NAS 安装包的服务地址与 GitHub 备用下载。',
    ),
  ];

  @override
  Widget build(BuildContext context) => SafeArea(
    child: SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('操作手册', style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 6),
          Text(
            '移动端与桌面端共用同一账号和账本数据。下面按功能逐项说明入口、用途、权限边界和常见注意事项。',
            style: TextStyle(color: _mobileMuted, height: 1.45),
          ),
          const SizedBox(height: 14),
          for (final section in sections)
            ExpansionTile(
              tilePadding: EdgeInsets.zero,
              childrenPadding: const EdgeInsets.only(bottom: 10),
              title: Text(
                section.title,
                style: const TextStyle(fontWeight: FontWeight.w800),
              ),
              children: [
                Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    section.text,
                    style: TextStyle(color: _mobileMuted, height: 1.55),
                  ),
                ),
              ],
            ),
        ],
      ),
    ),
  );
}

Future<void> _checkMobileUpdate(
  BuildContext context,
  LedgerController controller,
  String nativeVersion,
) async {
  final service = NeoLedgerUpdateService();
  try {
    final latest = await service.checkLatest();
    if (!context.mounted) return;
    if (latest == null || !latest.isNewerThan(nativeVersion)) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('当前已经是最新正式版 v$nativeVersion')));
      return;
    }

    final platform = controller.isAndroid ? 'android' : 'ios';
    final asset = latest.serviceAssetFor(platform) ?? latest.assetFor(platform);
    final assetName = latest.assetNameFor(platform);
    final uri = Uri.tryParse(asset ?? latest.releaseUrl);
    if (controller.isAndroid &&
        asset != null &&
        assetName != null &&
        assetName.toLowerCase().endsWith('.apk')) {
      Map<String, dynamic> result;
      try {
        result = await controller.installAndroidUpdate(
          version: latest.version,
          apkUrl: asset,
          apkName: assetName,
          checksumUrl: latest.checksumManifestUrl,
        );
      } catch (_) {
        final fallback = latest.githubAssetFor('android');
        if (fallback == null || fallback == asset) rethrow;
        result = await controller.installAndroidUpdate(
          version: latest.version,
          apkUrl: fallback,
          apkName: assetName,
          checksumUrl: latest.githubChecksumManifestUrl,
        );
      }
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('${result['message'] ?? '已开始安装更新'}')),
        );
      }
      return;
    }
    if (uri != null) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  } catch (error) {
    if (context.mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('检查更新失败：$error')));
    }
  } finally {
    service.close();
  }
}

class MobileConnectionSyncSheet extends StatefulWidget {
  const MobileConnectionSyncSheet({required this.controller, super.key});

  final LedgerController controller;

  @override
  State<MobileConnectionSyncSheet> createState() =>
      _MobileConnectionSyncSheetState();
}

class _MobileConnectionSyncSheetState extends State<MobileConnectionSyncSheet> {
  late final TextEditingController endpoint;
  bool saving = false;
  bool syncing = false;

  @override
  void initState() {
    super.initState();
    endpoint = TextEditingController(text: widget.controller.api.baseUrl);
  }

  @override
  void dispose() {
    endpoint.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => saving = true);
    try {
      await widget.controller.saveBaseUrl(endpoint.text);
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('连接地址已保存')));
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('保存连接地址失败：$error')));
      }
    } finally {
      if (mounted) setState(() => saving = false);
    }
  }

  Future<void> _sync() async {
    setState(() => syncing = true);
    try {
      await widget.controller.syncQueue();
      await widget.controller.refresh();
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(const SnackBar(content: Text('同步完成，数据已刷新')));
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('同步失败：$error')));
      }
    } finally {
      if (mounted) setState(() => syncing = false);
    }
  }

  @override
  Widget build(BuildContext context) => SafeArea(
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
          Text('连接与同步', style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 8),
          Text(
            '手机、平板和桌面端使用同一个 API 地址。公网部署请使用设备可访问的 HTTPS 地址；localhost 只适用于当前设备。',
            style: TextStyle(color: _mobileMuted, height: 1.45),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: endpoint,
            keyboardType: TextInputType.url,
            autocorrect: false,
            decoration: const InputDecoration(
              labelText: 'Neo Ledger 服务地址',
              hintText: 'https://ledger.eyeme.online',
              prefixIcon: Icon(Icons.link_rounded),
            ),
          ),
          const SizedBox(height: 10),
          FilledButton.icon(
            onPressed: saving ? null : _save,
            icon: saving
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.save_outlined),
            label: Text(saving ? '保存中…' : '保存连接地址'),
          ),
          const SizedBox(height: 18),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: _mobileBoxDecoration(
              gradient: LinearGradient(
                colors: [
                  _mobileBrand.withValues(alpha: .13),
                  _mobilePurple.withValues(alpha: .10),
                ],
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.controller.totalPendingCount == 0
                      ? '当前设备已同步'
                      : '${widget.controller.totalPendingCount} 笔待同步或待确认',
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 5),
                Text(
                  '已登录：${widget.controller.authenticated ? '是' : '否'} · 当前账本：${widget.controller.selectedLedger?.name ?? '未选择'}',
                  style: TextStyle(color: _mobileMuted, fontSize: 12),
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: syncing ? null : _sync,
            icon: syncing
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.sync_rounded),
            label: Text(syncing ? '同步中…' : '立即同步并刷新'),
          ),
        ],
      ),
    ),
  );
}

Future<void> _showMobileFeatureHub(
  BuildContext context,
  LedgerController controller,
) async {
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    backgroundColor: _mobileSurface,
    builder: (sheetContext) => MobileFeatureHubSheet(
      controller: controller,
      onOpenRoute: (route) {
        Navigator.pop(sheetContext);
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (context.mounted) {
            unawaited(MobileRouteRegistry.push<void>(context, route));
          }
        });
      },
      onOpenSheet: (child) {
        Navigator.pop(sheetContext);
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!context.mounted) return;
          unawaited(
            showModalBottomSheet<void>(
              context: context,
              isScrollControlled: true,
              useRootNavigator: true,
              useSafeArea: true,
              showDragHandle: true,
              backgroundColor: _mobileSurface,
              builder: (_) => child,
            ),
          );
        });
      },
    ),
  );
}

Future<void> _showMobileAiAssistant(
  BuildContext context,
  LedgerController controller,
) async {
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useRootNavigator: true,
    useSafeArea: true,
    showDragHandle: true,
    backgroundColor: _mobileSurface,
    builder: (_) => AiSheet(controller: controller),
  );
}

String _mobileThemeLabel(String theme) => switch (theme) {
  'glacier' => '冰川极简',
  'peach' => '蜜桃多巴胺',
  'obsidian' => '曜石极客',
  _ => '治愈奶卡',
};

String _mobileThemeModeLabel(String mode) => switch (mode) {
  'system' => '跟随系统',
  'light' => '浅色模式',
  _ => '深色模式',
};

class MobileFeatureHubSheet extends StatelessWidget {
  const MobileFeatureHubSheet({
    required this.controller,
    required this.onOpenRoute,
    required this.onOpenSheet,
    super.key,
  });

  final LedgerController controller;
  final ValueChanged<String> onOpenRoute;
  final ValueChanged<Widget> onOpenSheet;

  @override
  Widget build(BuildContext context) {
    final features =
        <({IconData icon, String title, String subtitle, String route})>[
          (
            icon: Icons.receipt_long_rounded,
            title: '个人账单',
            subtitle: '${controller.transactions.total} 笔流水',
            route: MobileRouteName.bills,
          ),
          (
            icon: Icons.account_balance_wallet_rounded,
            title: '个人资产',
            subtitle:
                '${controller.accounts.length} 个账户 · ${controller.assets.length} 项资产',
            route: MobileRouteName.accounts,
          ),
          (
            icon: Icons.insights_rounded,
            title: '统计分析',
            subtitle: '分类、趋势、储蓄率与 FIRE',
            route: MobileRouteName.analysis,
          ),
          (
            icon: Icons.event_note_rounded,
            title: '管理规划',
            subtitle: '预算、订阅、分期、储蓄目标',
            route: MobileRouteName.planning,
          ),
          (
            icon: Icons.auto_awesome_rounded,
            title: '自动记账',
            subtitle: '自动化规则与截图识别',
            route: MobileRouteName.automation,
          ),
          (
            icon: Icons.add_circle_outline_rounded,
            title: '记一笔',
            subtitle: '快速新增收入或支出',
            route: MobileRouteName.entry,
          ),
        ];
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('全部功能', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 6),
            Text(
              '移动端与桌面端使用同一套账本数据，常用能力在这里集中入口。',
              style: TextStyle(color: _mobileMuted),
            ),
            const SizedBox(height: 16),
            GridView.count(
              crossAxisCount: 2,
              crossAxisSpacing: 10,
              mainAxisSpacing: 10,
              childAspectRatio: 1.45,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              children: [
                for (final feature in features)
                  _MobileFeatureTile(
                    icon: feature.icon,
                    title: feature.title,
                    subtitle: feature.subtitle,
                    onTap: () => onOpenRoute(feature.route),
                  ),
              ],
            ),
            const SizedBox(height: 18),
            _SectionHeader(title: '桌面端常用能力', action: '同一账本'),
            const SizedBox(height: 10),
            _FeatureActionRow(
              icon: Icons.auto_awesome_rounded,
              title: 'AI 财务助手',
              subtitle: '基于当前账本分析，不会自动改账',
              onTap: () => onOpenSheet(AiSheet(controller: controller)),
            ),
            _FeatureActionRow(
              icon: Icons.file_upload_outlined,
              title: '账单导入',
              subtitle: 'CSV、JSON、TXT，先预览再确认写入',
              onTap: () => onOpenSheet(ImportSheet(controller: controller)),
            ),
            _FeatureActionRow(
              icon: Icons.people_alt_outlined,
              title: '分账与结算',
              subtitle: '记录参与人往来，结算生成可追踪流水',
              onTap: () => onOpenSheet(SettlementSheet(controller: controller)),
            ),
            _FeatureActionRow(
              icon: Icons.local_fire_department_outlined,
              title: 'FIRE 与通胀参数',
              subtitle: '设置预测基准，分析页即时使用',
              onTap: () =>
                  onOpenSheet(FinanceSettingsSheet(controller: controller)),
            ),
            _FeatureActionRow(
              icon: Icons.backup_outlined,
              title: '数据与备份',
              subtitle: '导出、恢复、预检与同步待处理流水',
              onTap: () => onOpenSheet(DataCenterSheet(controller: controller)),
            ),
          ],
        ),
      ),
    );
  }
}

class _FeatureActionRow extends StatelessWidget {
  const _FeatureActionRow({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Material(
      color: _mobileSurfaceRaised,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: _mobileLine),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: ListTile(
          leading: Icon(icon, color: _mobileBrand),
          title: Text(
            title,
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
          subtitle: Text(subtitle),
          trailing: Icon(Icons.chevron_right_rounded, color: _mobileMuted),
        ),
      ),
    ),
  );
}

class _MobileFeatureTile extends StatelessWidget {
  const _MobileFeatureTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
    color: _mobileSurfaceRaised,
    shape: RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(18),
      side: BorderSide(color: _mobileLine),
    ),
    clipBehavior: Clip.antiAlias,
    child: InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: _mobileBrand, size: 25),
            const Spacer(),
            Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
            const SizedBox(height: 3),
            Text(
              subtitle,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: _mobileMuted, fontSize: 11),
            ),
          ],
        ),
      ),
    ),
  );
}

class MobileAppearanceSheet extends StatefulWidget {
  const MobileAppearanceSheet({required this.controller, super.key});

  final LedgerController controller;

  @override
  State<MobileAppearanceSheet> createState() => _MobileAppearanceSheetState();
}

class _MobileAppearanceSheetState extends State<MobileAppearanceSheet> {
  late String theme;
  late String mode;
  late String defaultCurrency;
  late bool highContrast;
  bool saving = false;

  @override
  void initState() {
    super.initState();
    theme = widget.controller.preferences.theme;
    mode = widget.controller.preferences.mobileThemeMode;
    defaultCurrency = widget.controller.preferences.defaultCurrency;
    highContrast = widget.controller.preferences.highContrast;
  }

  Future<void> _save() async {
    setState(() => saving = true);
    try {
      final preferences = widget.controller.preferences;
      await widget.controller.savePreferences(
        theme: theme,
        lockEnabled: preferences.lockEnabled,
        mobileThemeMode: mode,
        highContrast: highContrast,
        defaultCurrency: defaultCurrency,
      );
      if (mounted) Navigator.pop(context);
    } catch (error) {
      if (mounted) {
        setState(() => saving = false);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('保存外观设置失败：$error')));
      }
    }
  }

  @override
  Widget build(BuildContext context) => SafeArea(
    child: SingleChildScrollView(
      padding: EdgeInsets.fromLTRB(
        20,
        8,
        20,
        MediaQuery.viewInsetsOf(context).bottom + 24,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('主题与外观', style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 6),
          Text(
            '主题会同步到你的其他设备，明暗模式只影响当前移动端显示方式。',
            style: TextStyle(color: _mobileMuted, height: 1.4),
          ),
          const SizedBox(height: 18),
          Text('主题风格', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final item in const [
                ('cream', '治愈奶卡'),
                ('glacier', '冰川极简'),
                ('peach', '蜜桃多巴胺'),
                ('obsidian', '曜石极客'),
              ])
                ChoiceChip(
                  label: Text(item.$2),
                  selected: theme == item.$1,
                  onSelected: (_) => setState(() => theme = item.$1),
                ),
            ],
          ),
          const SizedBox(height: 18),
          Text('明暗模式', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          SegmentedButton<String>(
            segments: const [
              ButtonSegment(value: 'system', label: Text('跟随系统')),
              ButtonSegment(value: 'light', label: Text('浅色')),
              ButtonSegment(value: 'dark', label: Text('深色')),
            ],
            selected: {mode},
            onSelectionChanged: (value) => setState(() => mode = value.first),
          ),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            initialValue: defaultCurrency,
            decoration: const InputDecoration(
              labelText: '新账户默认币种',
              border: OutlineInputBorder(),
            ),
            items: const [
              DropdownMenuItem(value: 'CNY', child: Text('CNY · 人民币')),
              DropdownMenuItem(value: 'USD', child: Text('USD · 美元')),
              DropdownMenuItem(value: 'JPY', child: Text('JPY · 日元')),
              DropdownMenuItem(value: 'EUR', child: Text('EUR · 欧元')),
            ],
            onChanged: (value) {
              if (value != null) setState(() => defaultCurrency = value);
            },
          ),
          SwitchListTile.adaptive(
            contentPadding: EdgeInsets.zero,
            title: const Text('高对比度'),
            subtitle: const Text('增强边界与文字对比度'),
            value: highContrast,
            onChanged: (value) => setState(() => highContrast = value),
          ),
          const SizedBox(height: 10),
          FilledButton.icon(
            onPressed: saving ? null : _save,
            icon: saving
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.check_rounded),
            label: Text(saving ? '保存中…' : '保存外观设置'),
          ),
        ],
      ),
    ),
  );
}

class MobileAchievementSheet extends StatelessWidget {
  const MobileAchievementSheet({required this.controller, super.key});

  final LedgerController controller;

  static int get totalCount => _definitions.length;

  static int unlockedCount(LedgerController controller) =>
      _badges(controller).where((badge) => badge.unlocked).length;

  static const _definitions = <_MobileAchievementDefinition>[
    _MobileAchievementDefinition(
      'first_spark',
      '✍️',
      '第一笔星火',
      '完成账本中的第一笔记录',
      '普通',
    ),
    _MobileAchievementDefinition(
      'income_scout',
      '🧧',
      '开源侦察兵',
      '记录人生第一笔收入',
      '普通',
    ),
    _MobileAchievementDefinition(
      'account_architect',
      '🏦',
      '账户建筑师',
      '建立至少 3 个资金账户',
      '普通',
    ),
    _MobileAchievementDefinition(
      'seven_day_scribe',
      '🗓️',
      '七日记账官',
      '近 30 天内有 7 天完成记账',
      '普通',
    ),
    _MobileAchievementDefinition(
      'positive_month',
      '🌱',
      '月度正循环',
      '本月收入高于支出',
      '普通',
    ),
    _MobileAchievementDefinition(
      'dream_planter',
      '🌟',
      '心愿播种者',
      '建立第一个心愿储蓄目标',
      '普通',
    ),
    _MobileAchievementDefinition(
      'coffee_knight',
      '☕',
      '咖啡断奶骑士',
      '连续 7 天咖啡支出为 0',
      '稀有',
    ),
    _MobileAchievementDefinition(
      'ledger_regular',
      '📚',
      '账本常驻民',
      '累计完成 50 笔收支记录',
      '稀有',
    ),
    _MobileAchievementDefinition(
      'century_club',
      '💯',
      '百笔俱乐部',
      '累计完成 100 笔收支记录',
      '稀有',
    ),
    _MobileAchievementDefinition(
      'income_diversifier',
      '🌈',
      '收入多栖玩家',
      '点亮至少 3 种收入来源',
      '稀有',
    ),
    _MobileAchievementDefinition(
      'budget_guardian',
      '🧭',
      '预算守门人',
      '本月有消费且总支出未超预算',
      '稀有',
    ),
    _MobileAchievementDefinition(
      'mindful_week',
      '🧘',
      '清醒消费一周',
      '近 7 天有记账且零冲动消费',
      '稀有',
    ),
    _MobileAchievementDefinition(
      'category_explorer',
      '🗺️',
      '消费地图家',
      '记录过至少 5 个支出分类',
      '稀有',
    ),
    _MobileAchievementDefinition(
      'side_hustle_starter',
      '💼',
      '副业启航者',
      '记录第一笔副业收入',
      '稀有',
    ),
    _MobileAchievementDefinition(
      'investor_awakened',
      '📈',
      '投资意识觉醒',
      '建立第一个投资账户',
      '稀有',
    ),
    _MobileAchievementDefinition(
      'digital_curator',
      '🏛️',
      '资产典藏家',
      '统一管理至少 3 件实物或虚拟资产',
      '稀有',
    ),
    _MobileAchievementDefinition(
      'frugal_week',
      '🪶',
      '轻盈消费周',
      '近 7 天有记账且支出不超过 ¥100',
      '稀有',
    ),
    _MobileAchievementDefinition(
      'temptation_fighter',
      '🛡️',
      '抗住诱惑反击者',
      '月过半且冲动消费为 0',
      '史诗',
    ),
    _MobileAchievementDefinition(
      'full_revive',
      '🔥',
      '满血复活',
      '近 30 天每天都完成记账',
      '史诗',
    ),
    _MobileAchievementDefinition(
      'savings_pilot',
      '🚀',
      '储蓄率飞行员',
      '本月储蓄率达到 20%',
      '史诗',
    ),
    _MobileAchievementDefinition(
      'super_saver',
      '💎',
      '半数收入守护者',
      '本月储蓄率达到 50%',
      '史诗',
    ),
    _MobileAchievementDefinition(
      'debt_tamer',
      '🕊️',
      '负债驯服者',
      '成功清偿至少一个负债账户',
      '史诗',
    ),
    _MobileAchievementDefinition(
      'wish_fulfilled',
      '🎆',
      '心愿兑现家',
      '完成至少一个心愿储蓄目标',
      '史诗',
    ),
    _MobileAchievementDefinition(
      'ledger_legend',
      '🏛️',
      '账本编年史',
      '累计完成 365 笔收支记录',
      '史诗',
    ),
    _MobileAchievementDefinition(
      'debt_free_hidden',
      '🪽',
      '无债之翼',
      '将名下所有负债账户全部清零',
      '隐藏',
    ),
    _MobileAchievementDefinition(
      'dawn_bookkeeper',
      '🌅',
      '破晓记账人',
      '在清晨 05:00–08:00 完成一笔记录',
      '隐藏',
    ),
    _MobileAchievementDefinition(
      'midnight_witness',
      '🌌',
      '午夜账本见证者',
      '在午夜 00:00–05:00 完成一笔记录',
      '隐藏',
    ),
  ];

  static Set<String> _unlockedCodes(LedgerController controller) {
    final remote = controller.achievements.map((item) => item.code).toSet();
    if (remote.isNotEmpty) return remote;
    final activeDays = <String>{};
    for (final item in controller.transactions.items) {
      final date = DateTime.tryParse(item.occurredAt)?.toLocal();
      if (date != null) {
        activeDays.add('${date.year}-${date.month}-${date.day}');
      }
    }
    return {
      if (controller.transactions.total > 0) 'first_spark',
      if (controller.transactions.items.any((item) => item.isIncome))
        'income_scout',
      if (controller.accounts.length >= 3) 'account_architect',
      if (activeDays.length >= 7) 'seven_day_scribe',
      if (controller.budgets.isNotEmpty) 'budget_guardian',
      if (controller.savingsGoals.isNotEmpty) 'dream_planter',
    };
  }

  static List<_MobileAchievement> _badges(LedgerController controller) {
    final unlocked = _unlockedCodes(controller);
    return [
      for (final definition in _definitions)
        _MobileAchievement(
          definition: definition,
          unlocked: unlocked.contains(definition.code),
        ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final badges = _badges(controller);
    final unlocked = badges.where((badge) => badge.unlocked).length;
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(18, 8, 18, 28),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('成就徽章', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 6),
            Text(
              '桌面端与手机端共用同一套 27 个成就、等级和解锁状态。',
              style: TextStyle(color: _mobileMuted),
            ),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(18),
              decoration: _mobileBoxDecoration(
                gradient: LinearGradient(
                  colors: [
                    _mobilePurple.withAlpha(55),
                    _mobileBrand.withAlpha(22),
                  ],
                ),
              ),
              child: Row(
                children: [
                  Container(
                    width: 58,
                    height: 58,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: LinearGradient(
                        colors: [
                          _mobileBrand.withValues(alpha: .25),
                          _mobilePurple.withValues(alpha: .18),
                        ],
                      ),
                      border: Border.all(
                        color: _mobileBrand.withValues(alpha: .55),
                      ),
                    ),
                    child: const Text('🏆', style: TextStyle(fontSize: 31)),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      '已解锁 $unlocked/${badges.length} 个成就',
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                crossAxisSpacing: 10,
                mainAxisSpacing: 10,
                childAspectRatio: .92,
              ),
              itemCount: badges.length,
              itemBuilder: (_, index) =>
                  _MobileAchievementTile(badge: badges[index]),
            ),
          ],
        ),
      ),
    );
  }
}

class _MobileAchievementDefinition {
  const _MobileAchievementDefinition(
    this.code,
    this.glyph,
    this.title,
    this.subtitle,
    this.tier,
  );

  final String code;
  final String glyph;
  final String title;
  final String subtitle;
  final String tier;
}

class _MobileAchievement {
  const _MobileAchievement({required this.definition, required this.unlocked});

  final _MobileAchievementDefinition definition;
  final bool unlocked;
}

class _MobileAchievementTile extends StatelessWidget {
  const _MobileAchievementTile({required this.badge});

  final _MobileAchievement badge;

  Color get _accent => switch (badge.definition.tier) {
    '稀有' => const Color(0xff3f91d1),
    '史诗' => const Color(0xff9b5bd5),
    '隐藏' => const Color(0xffc34b70),
    _ => const Color(0xffb99754),
  };

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(18),
      border: Border.all(
        color: _accent.withValues(alpha: badge.unlocked ? .46 : .18),
      ),
      gradient: LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [
          _accent.withValues(alpha: badge.unlocked ? .18 : .07),
          _mobileSurfaceRaised,
        ],
      ),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(
              badge.definition.glyph,
              style: TextStyle(
                fontSize: 29,
                color: badge.unlocked ? null : _mobileMuted,
              ),
            ),
            const Spacer(),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
              decoration: BoxDecoration(
                color: _accent.withValues(alpha: badge.unlocked ? .22 : .10),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                badge.definition.tier,
                style: TextStyle(
                  color: _accent,
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Text(
          badge.unlocked
              ? badge.definition.title
              : '未解锁 · ${badge.definition.title}',
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
            fontWeight: FontWeight.w800,
            color: badge.unlocked ? _mobileText : _mobileMuted,
          ),
        ),
        const SizedBox(height: 4),
        Expanded(
          child: Text(
            badge.definition.subtitle,
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(color: _mobileMuted, fontSize: 11, height: 1.3),
          ),
        ),
        Row(
          children: [
            Expanded(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(5),
                child: LinearProgressIndicator(
                  minHeight: 5,
                  value: badge.unlocked ? 1 : 0,
                  backgroundColor: _mobileLine,
                  valueColor: AlwaysStoppedAnimation(_accent),
                ),
              ),
            ),
            const SizedBox(width: 7),
            Icon(
              badge.unlocked
                  ? Icons.check_circle_rounded
                  : Icons.lock_outline_rounded,
              size: 17,
              color: badge.unlocked ? _accent : _mobileMuted,
            ),
          ],
        ),
      ],
    ),
  );
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
                            MobileConnectionSyncSheet(
                              controller: widget.controller,
                            ),
                          ),
                    icon: const Icon(Icons.sync_rounded),
                    label: const Text('打开连接与同步'),
                  ),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: actionBusy
                        ? null
                        : () => _openSheet(
                            SettingsSheet(controller: widget.controller),
                          ),
                    icon: const Icon(Icons.tune_rounded),
                    label: const Text('Android 自动记账高级配置'),
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
