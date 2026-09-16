<?php
declare(strict_types=1);

require_once __DIR__ . '/lib.php';

function portal_profile_for_user(array $state, array $user): array {
    $email = strtolower((string)($user['email'] ?? ''));
    foreach (($state['profiles'] ?? []) as $profile) {
        if (strtolower((string)($profile['email'] ?? '')) === $email) return is_array($profile) ? $profile : [];
    }
    return [];
}

function portal_access_for_state(array $state, array $user): array {
    if (($user['role'] ?? '') === 'admin') {
        return ['admin' => true, 'foundation' => true, 'board' => true, 'cms' => true];
    }
    $profile = portal_profile_for_user($state, $user);
    $permissions = is_array($profile['permissions'] ?? null) ? $profile['permissions'] : [];
    $foundation = (($profile['kind'] ?? '') === 'founder') || !empty($permissions['access_foundation']);
    return [
        'admin' => false,
        'foundation' => $foundation,
        'board' => !empty($permissions['access_board']),
        'cms' => !empty($permissions['cms_manage']),
    ];
}

function portal_permissions_for_state(array $state, array $user): array {
    $keys = ['access_foundation','access_board','documents_edit','documents_finalize','files_manage','tasks_manage','polls_create','calendar_manage','decisions_manage','cms_manage','finance_manage'];
    if (($user['role'] ?? '') === 'admin') return array_fill_keys($keys, true);
    if (($user['role'] ?? '') === 'viewer') return array_fill_keys($keys, false);

    $profile = portal_profile_for_user($state, $user);
    $kind = (string)($profile['kind'] ?? 'member');
    $defaults = array_fill_keys($keys, false);
    if ($kind === 'founder') {
        foreach (['access_foundation','documents_edit','documents_finalize','files_manage','tasks_manage','polls_create','calendar_manage','decisions_manage'] as $key) $defaults[$key] = true;
    }
    $overrides = is_array($profile['permissions'] ?? null) ? $profile['permissions'] : [];
    foreach ($keys as $key) if (array_key_exists($key, $overrides)) $defaults[$key] = (bool)$overrides[$key];
    return $defaults;
}

function portal_permission_for_user(array $user, string $key): bool {
    if (($user['role'] ?? '') === 'admin') return true;
    $stmt = db()->prepare('SELECT data FROM project_state WHERE id = ? LIMIT 1');
    $stmt->execute(['kinderverein-main']);
    $row = $stmt->fetch();
    $state = $row && is_string($row['data'] ?? null) ? json_decode((string)$row['data'], true) : [];
    $permissions = portal_permissions_for_state(is_array($state) ? $state : [], $user);
    return !empty($permissions[$key]);
}

function sanitize_profiles_for_user(array $profiles, array $user): array {
    $email = strtolower((string)($user['email'] ?? ''));
    $out = [];
    foreach ($profiles as $profile) {
        if (!is_array($profile)) continue;
        $isOwn = strtolower((string)($profile['email'] ?? '')) === $email;
        if (!$isOwn && (($profile['visible'] ?? true) === false)) continue;
        if (!$isOwn) unset($profile['permissions'], $profile['selfRegistered']);
        $out[] = $profile;
    }
    return $out;
}

function filter_scope_items(array $items, bool $allowFoundation, bool $allowBoard): array {
    return array_values(array_filter($items, static function ($item) use ($allowFoundation, $allowBoard): bool {
        if (!is_array($item)) return false;
        $scope = (string)($item['scope'] ?? 'foundation');
        if ($scope === 'public' || $scope === 'member') return true;
        if ($scope === 'board') return $allowBoard;
        return $allowFoundation;
    }));
}

function filter_project_state_for_user(array $state, array $user): array {
    $access = portal_access_for_state($state, $user);
    if ($access['admin']) return $state;

    $state['profiles'] = sanitize_profiles_for_user(is_array($state['profiles'] ?? null) ? $state['profiles'] : [], $user);
    $scopedKeys = ['tasks','documents','files','events','decisions','polls','activities','messages','phases','milestones'];
    foreach ($scopedKeys as $key) {
        $state[$key] = filter_scope_items(is_array($state[$key] ?? null) ? $state[$key] : [], $access['foundation'], $access['board']);
    }

    $permissions = portal_permissions_for_state($state, $user);
    if (!$access['board'] || empty($permissions['finance_manage'])) $state['finance'] = ['transactions'=>[], 'budgets'=>[], 'files'=>[], 'accounts'=>[]];

    if (!$access['foundation'] && !$access['board']) {
        $state['folders'] = [];
        $state['tasks'] = [];
        $state['documents'] = [];
        $state['files'] = [];
        $state['events'] = [];
        $state['decisions'] = [];
        $state['polls'] = filter_scope_items(is_array($state['polls'] ?? null) ? $state['polls'] : [], false, false);
        $state['activities'] = [];
        $state['messages'] = [];
        $state['phases'] = [];
        $state['milestones'] = [];
    }

    $ownOnboarding = $state['onboarding'][strtolower((string)($user['email'] ?? ''))] ?? null;
    $state['onboarding'] = $ownOnboarding === null ? [] : [strtolower((string)$user['email']) => $ownOnboarding];
    return $state;
}

function merge_own_profile(array $currentProfiles, array $incomingProfiles, array $user): array {
    $email = strtolower((string)($user['email'] ?? ''));
    $incomingOwn = null;
    foreach ($incomingProfiles as $profile) {
        if (is_array($profile) && strtolower((string)($profile['email'] ?? '')) === $email) { $incomingOwn = $profile; break; }
    }
    if (!$incomingOwn) return $currentProfiles;

    foreach ($currentProfiles as &$profile) {
        if (!is_array($profile) || strtolower((string)($profile['email'] ?? '')) !== $email) continue;
        foreach (['displayName','visible','area','bio'] as $field) {
            if (array_key_exists($field, $incomingOwn)) $profile[$field] = $incomingOwn[$field];
        }
        unset($profile);
        return $currentProfiles;
    }
    return $currentProfiles;
}

function merge_scoped_section(array $current, array $incoming, bool $allowBoard): array {
    if ($allowBoard) return $incoming;
    $protected = array_values(array_filter($current, static fn($item): bool => is_array($item) && (($item['scope'] ?? 'foundation') === 'board')));
    $allowed = array_values(array_filter($incoming, static fn($item): bool => !is_array($item) || (($item['scope'] ?? 'foundation') !== 'board')));
    return array_merge($allowed, $protected);
}

function merge_member_poll_votes(array $currentPolls, array $incomingPolls, array $user): array {
    $email = strtolower((string)($user['email'] ?? ''));
    if ($email === '') return $currentPolls;
    $incomingById = [];
    foreach ($incomingPolls as $poll) if (is_array($poll) && isset($poll['id'])) $incomingById[(string)$poll['id']] = $poll;

    foreach ($currentPolls as &$poll) {
        if (!is_array($poll) || (string)($poll['scope'] ?? 'foundation') !== 'member' || (string)($poll['status'] ?? 'open') !== 'open') continue;
        $incomingPoll = $incomingById[(string)($poll['id'] ?? '')] ?? null;
        if (!is_array($incomingPoll)) continue;
        $selectedId = null;
        foreach (($incomingPoll['options'] ?? []) as $option) {
            if (!is_array($option)) continue;
            $votes = is_array($option['votes'] ?? null) ? $option['votes'] : [];
            foreach ($votes as $voteEmail) {
                if (strtolower((string)$voteEmail) === $email) { $selectedId = (string)($option['id'] ?? ''); break 2; }
            }
        }
        foreach ($poll['options'] as &$option) {
            if (!is_array($option)) continue;
            $votes = is_array($option['votes'] ?? null) ? $option['votes'] : [];
            $votes = array_values(array_filter($votes, static fn($voteEmail): bool => strtolower((string)$voteEmail) !== $email));
            if ($selectedId !== null && (string)($option['id'] ?? '') === $selectedId) $votes[] = $email;
            $option['votes'] = array_values(array_unique($votes));
        }
        unset($option);
    }
    unset($poll);
    return $currentPolls;
}

function merge_member_polls_for_cms(array $currentPolls, array $incomingPolls): array {
    $protected = array_values(array_filter($currentPolls, static fn($poll): bool => !is_array($poll) || (string)($poll['scope'] ?? 'foundation') !== 'member'));
    $member = array_values(array_filter($incomingPolls, static fn($poll): bool => is_array($poll) && (string)($poll['scope'] ?? 'foundation') === 'member'));
    return array_merge($member, $protected);
}

function merge_project_state_for_user(array $current, array $incoming, array $user): array {
    $access = portal_access_for_state($current, $user);
    if ($access['admin']) return $incoming;

    $current['profiles'] = merge_own_profile(
        is_array($current['profiles'] ?? null) ? $current['profiles'] : [],
        is_array($incoming['profiles'] ?? null) ? $incoming['profiles'] : [],
        $user
    );
    $email = strtolower((string)($user['email'] ?? ''));
    if (isset($incoming['onboarding'][$email])) {
        if (!isset($current['onboarding']) || !is_array($current['onboarding'])) $current['onboarding'] = [];
        $current['onboarding'][$email] = $incoming['onboarding'][$email];
    }

    $current['polls'] = merge_member_poll_votes(is_array($current['polls'] ?? null) ? $current['polls'] : [], is_array($incoming['polls'] ?? null) ? $incoming['polls'] : [], $user);

    if ($access['foundation'] || $access['board']) {
        $permissions = portal_permissions_for_state($current, $user);
        $sectionPermission = [
            'tasks' => 'tasks_manage',
            'documents' => 'documents_edit',
            'files' => 'files_manage',
            'events' => 'calendar_manage',
            'decisions' => 'decisions_manage',
        ];
        foreach ($sectionPermission as $key => $permission) {
            if (!empty($permissions[$permission])) {
                $current[$key] = merge_scoped_section(
                    is_array($current[$key] ?? null) ? $current[$key] : [],
                    is_array($incoming[$key] ?? null) ? $incoming[$key] : [],
                    $access['board']
                );
            }
        }
        // Abstimmen darf der Gründungsbereich; Erstellen/Verwalten bleibt zusätzlich in der UI eingeschränkt.
        if ($access['foundation'] && isset($incoming['polls']) && is_array($incoming['polls'])) {
            $current['polls'] = merge_scoped_section(is_array($current['polls'] ?? null) ? $current['polls'] : [], $incoming['polls'], $access['board']);
        }
        if (!empty($permissions['files_manage']) && isset($incoming['folders']) && is_array($incoming['folders'])) $current['folders'] = $incoming['folders'];
    }

    $permissions = portal_permissions_for_state($current, $user);
    if ($access['board'] && !empty($permissions['finance_manage']) && isset($incoming['finance']) && is_array($incoming['finance'])) $current['finance'] = $incoming['finance'];

    if ($access['cms']) {
        if (isset($incoming['settings']) && is_array($incoming['settings'])) $current['settings'] = $incoming['settings'];
        if (isset($incoming['polls']) && is_array($incoming['polls'])) $current['polls'] = merge_member_polls_for_cms(is_array($current['polls'] ?? null) ? $current['polls'] : [], $incoming['polls']);
    }
    return $current;
}

function portal_access_for_user(array $user): array {
    $stmt = db()->prepare('SELECT data FROM project_state WHERE id = ? LIMIT 1');
    $stmt->execute(['kinderverein-main']);
    $row = $stmt->fetch();
    $state = $row && is_string($row['data'] ?? null) ? json_decode((string)$row['data'], true) : [];
    return portal_access_for_state(is_array($state) ? $state : [], $user);
}


function portal_file_scope(array $state, string $id): string {
    foreach (($state['files'] ?? []) as $file) {
        if (is_array($file) && (string)($file['id'] ?? '') === $id) return (string)($file['scope'] ?? 'foundation');
    }
    foreach (($state['settings']['publicBlocks'] ?? []) as $block) {
        if (is_array($block) && (string)($block['imageId'] ?? '') === $id) return 'public-cms';
    }
    foreach (($state['settings']['memberBlocks'] ?? []) as $block) {
        if (is_array($block) && (string)($block['imageId'] ?? '') === $id) return 'member-cms';
    }
    foreach (($state['polls'] ?? []) as $poll) {
        if (!is_array($poll)) continue;
        foreach (($poll['options'] ?? []) as $option) {
            if (!is_array($option) || (string)($option['imageId'] ?? '') !== $id) continue;
            $scope = (string)($poll['scope'] ?? 'foundation');
            if ($scope === 'member') return 'member-cms';
            if ($scope === 'board') return 'board';
            return 'foundation';
        }
    }
    return 'foundation';
}

function portal_can_access_file(array $user, string $id): bool {
    if (($user['role'] ?? '') === 'admin') return true;
    $stmt = db()->prepare('SELECT data FROM project_state WHERE id = ? LIMIT 1');
    $stmt->execute(['kinderverein-main']);
    $row = $stmt->fetch();
    $state = $row && is_string($row['data'] ?? null) ? json_decode((string)$row['data'], true) : [];
    if (!is_array($state)) $state = [];
    $scope = portal_file_scope($state, $id);
    $access = portal_access_for_state($state, $user);
    $permissions = portal_permissions_for_state($state, $user);
    if ($scope === 'treasury') return $access['board'] && !empty($permissions['finance_manage']);
    if ($scope === 'member-cms') return true;
    if ($scope === 'public-cms') return false;
    if ($scope === 'board') return $access['board'];
    return $access['foundation'];
}
