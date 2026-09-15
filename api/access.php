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
    if (!$allowFoundation && !$allowBoard) return [];
    return array_values(array_filter($items, static function ($item) use ($allowFoundation, $allowBoard): bool {
        if (!is_array($item)) return false;
        $scope = (string)($item['scope'] ?? 'foundation');
        if ($scope === 'board') return $allowBoard;
        if ($scope === 'public' || $scope === 'member') return true;
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

    if (!$access['foundation'] && !$access['board']) {
        $state['folders'] = [];
        $state['tasks'] = [];
        $state['documents'] = [];
        $state['files'] = [];
        $state['events'] = [];
        $state['decisions'] = [];
        $state['polls'] = [];
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

    if ($access['foundation'] || $access['board']) {
        foreach (['tasks','documents','files','events','decisions','polls','activities','messages','phases','milestones'] as $key) {
            $current[$key] = merge_scoped_section(
                is_array($current[$key] ?? null) ? $current[$key] : [],
                is_array($incoming[$key] ?? null) ? $incoming[$key] : [],
                $access['board']
            );
        }
        if (isset($incoming['folders']) && is_array($incoming['folders'])) $current['folders'] = $incoming['folders'];
    }

    if ($access['cms'] && isset($incoming['settings']) && is_array($incoming['settings'])) {
        $current['settings'] = $incoming['settings'];
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
