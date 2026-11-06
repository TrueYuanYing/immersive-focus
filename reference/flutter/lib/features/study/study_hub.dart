import '../settings/storage_resources_screen.dart';
import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import 'cafe_focus_screen.dart';

ThemeData studyTheme() => ThemeData(
      brightness: Brightness.dark,
      useMaterial3: true,
      scaffoldBackgroundColor: const Color(0xFF0E1013),
      colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFFFFFFFF),
          brightness: Brightness.dark,
          surface: const Color(0xFF191C21),
          primary: const Color(0xFFFFFFFF)),
    );

/// Scene selection does not mount a WebView until the cafe is opened.
class StudyHub extends StatelessWidget {
  const StudyHub({super.key});

  @override
  Widget build(BuildContext context) {
    final brightness = Theme.of(context).brightness;
    return Scaffold(
      appBar: Navigator.of(context).canPop()
          ? AppBar(title: const Text('专注场景'))
          : null,
      body: SafeArea(
        child: CustomScrollView(slivers: [
          SliverToBoxAdapter(
              child: Center(
                  child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 1080),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(24, 20, 24, 32),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(children: [
                      Expanded(
                          child: Text('IKO  /  FOCUS',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                  fontSize: 11,
                                  letterSpacing: 3,
                                  color: AppColors.secondary(brightness)))),
                      IconButton(
                          tooltip: '场景资源包',
                          onPressed: () => Navigator.of(context).push(
                              MaterialPageRoute(
                                  builder: (_) =>
                                      const StudyResourcesScreen())),
                          icon:
                              const Icon(Icons.inventory_2_outlined, size: 21)),
                    ]),
                    const SizedBox(height: 18),
                    Text('今天，去哪里专注？',
                        style: TextStyle(
                            fontSize: 31,
                            height: 1.2,
                            letterSpacing: -1,
                            fontWeight: FontWeight.w600,
                            color: AppColors.label(brightness))),
                    const SizedBox(height: 9),
                    Text('先在街角坐一会儿。海上与云端的风景，正在准备。',
                        style: TextStyle(
                            fontSize: 13,
                            height: 1.5,
                            color: AppColors.secondary(brightness))),
                    const SizedBox(height: 22),
                    Divider(color: AppColors.separator(brightness)),
                    const SizedBox(height: 14),
                    Row(children: [
                      const Expanded(
                          child: Text('选择你的场景',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style:
                                  TextStyle(fontSize: 12, letterSpacing: 1))),
                      Text('03 PLACES',
                          style: TextStyle(
                              fontSize: 10,
                              letterSpacing: 2,
                              color: AppColors.secondary(brightness))),
                    ]),
                    const SizedBox(height: 14),
                    LayoutBuilder(builder: (context, constraints) {
                      final cards = [
                        _SceneCard(
                            id: '01',
                            title: '窗间 MADO',
                            subtitle: '咖啡馆自习',
                            copy: '一杯温热的咖啡，陪你写完这一页。',
                            icon: Icons.coffee_outlined,
                            tint: const Color(0xFFE3AD71),
                            image: 'mado',
                            announcement: '进入场景',
                            onTap: () => CafeFocusScreen.open(context)),
                        const _SceneCard(
                            id: '02',
                            title: '汐间 SHIO',
                            subtitle: '轮渡自习',
                            copy: '下一程，驶向群岛。邮船将是下一个开放的场景。',
                            icon: Icons.directions_boat_outlined,
                            tint: Color(0xFF5DD1C1),
                            image: 'haijian',
                            announcement: '即将上线'),
                        const _SceneCard(
                            id: '03',
                            title: '云间 KUMO',
                            subtitle: '飞机自习',
                            copy: '选一座城市，把专注带上云端。场景仍在打磨中。',
                            icon: Icons.flight,
                            tint: Color(0xFFE7B27C),
                            image: 'flight',
                            announcement: '敬请期待'),
                      ];
                      return constraints.maxWidth >= 760
                          ? Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                  for (var i = 0; i < cards.length; i++) ...[
                                    if (i > 0) const SizedBox(width: 14),
                                    Expanded(child: cards[i]),
                                  ],
                                ])
                          : Column(children: [
                              for (final card in cards)
                                Padding(
                                    padding: const EdgeInsets.only(bottom: 14),
                                    child: card),
                            ]);
                    }),
                    const SizedBox(height: 20),
                    Text('窗间已开放。邮船即将上线，飞机敬请期待；已有场景存档会保留。',
                        style: TextStyle(
                            fontSize: 12,
                            height: 1.6,
                            color: AppColors.secondary(brightness))),
                  ]),
            ),
          ))),
        ]),
      ),
    );
  }
}

class _SceneCard extends StatelessWidget {
  const _SceneCard(
      {required this.id,
      required this.title,
      required this.subtitle,
      required this.copy,
      required this.icon,
      required this.tint,
      required this.image,
      required this.announcement,
      this.onTap});
  final String id, title, subtitle, copy, image;
  final IconData icon;
  final Color tint;
  final String announcement;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final brightness = theme.brightness;
    final linkColor = brightness == Brightness.dark
        ? tint
        : switch (image) {
            'flight' => const Color(0xFF965A2F),
            'mado' => const Color(0xFF83501B),
            _ => const Color(0xFF147768),
          };
    return Card(
      margin: EdgeInsets.zero,
      color: AppColors.card(brightness),
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(color: AppColors.separator(brightness))),
      child: InkWell(
          onTap: onTap,
          customBorder:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            AspectRatio(
                aspectRatio: 16 / 9,
                child: Stack(fit: StackFit.expand, children: [
                  Image.asset(
                      image == 'flight'
                          ? 'assets/study/flight-rebuild.png'
                          : 'assets/study/$image.jpg',
                      fit: BoxFit.contain,
                      errorBuilder: (_, error, stack) =>
                          Center(child: Icon(icon, color: tint, size: 56))),
                  const DecoratedBox(
                      decoration: BoxDecoration(color: Color(0x220E1013))),
                  Positioned(
                      left: 16,
                      top: 14,
                      child: Text(id,
                          style: const TextStyle(
                              fontSize: 11,
                              letterSpacing: 2,
                              color: Color(0xFFF6F4EF)))),
                  Positioned(
                      right: 14,
                      bottom: 14,
                      child: DecoratedBox(
                          decoration: BoxDecoration(
                              color: const Color(0xEE0E1013),
                              borderRadius: BorderRadius.circular(5)),
                          child: Padding(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 9, vertical: 5),
                              child: Text(subtitle,
                                  style: TextStyle(
                                      color: tint,
                                      fontSize: 11,
                                      fontWeight: FontWeight.w600))))),
                ])),
            Padding(
                padding: const EdgeInsets.fromLTRB(16, 15, 16, 14),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title,
                          style: TextStyle(
                              fontSize: 19,
                              color: AppColors.label(brightness),
                              fontWeight: FontWeight.w600)),
                      const SizedBox(height: 6),
                      Text(copy,
                          style: TextStyle(
                              fontSize: 12,
                              height: 1.5,
                              color: AppColors.secondary(brightness))),
                      const SizedBox(height: 14),
                      Row(children: [
                        Text(announcement,
                            style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: linkColor)),
                        const Spacer(),
                        Icon(
                            onTap == null
                                ? Icons.schedule
                                : Icons.arrow_forward,
                            color: linkColor,
                            size: 18)
                      ]),
                    ])),
          ])),
    );
  }
}

class StudyResourcesScreen extends StatelessWidget {
  const StudyResourcesScreen({super.key});
  @override
  Widget build(BuildContext context) =>
      const StorageResourcesScreen(highlightPack: 'focus-mado');
}
