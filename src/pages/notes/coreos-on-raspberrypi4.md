---
layout: ../../layouts/NoteLayout.astro
title: Установка CoreOS на Raspberry Pi 4
description: Заметка о том, как установить CoreOS на Raspberry Pi 4
---

# Как установить CoreOS на Raspberry Pi 4

В заметке я описал процесс установки CoreOS на Raspberry Pi 4: от подготовки компонентов и конфигурации системы до записи образа на micro SD и запуска устройства.

## Подготовка

Сначала я собрал необходимый набор компонентов для Raspberry Pi:
* Raspberry Pi 4 Model B;
* SSD и адаптер USB-A к SATA;
* micro SD (в комплекте был удобный переходник USB-A к micro SD);
* блок питания и сетевой кабель.

Флешку нужно отформатировать, чтобы Raspberry Pi её корректно распознавала. Это можно сделать с помощью Raspberry Pi Imager. Вместо выбора операционной системы нужно выбрать опцию «отформатировать карту». Если на флешке уже есть разделы, их следует удалить, а затем выполнить форматирование.

Для установки CoreOS на Raspberry Pi есть [документация](https://docs.fedoraproject.org/en-US/fedora-coreos/provisioning-raspberry-pi4/). Для выполнения инструкций нужна Fedora Linux, но у меня была только Windows. Однако проблему можно решить с помощью WSL и [развёртывания образа Fedora](https://docs.fedoraproject.org/en-US/cloud/wsl/).

```shell
wsl --install
wsl --install FedoraLinux-43
wsl -d FedoraLinux-43
```

В Fedora я установил необходимые пакеты:
```shell
dnf install -y butane coreos-installer ignition-validate jq cpio
```

## Конфигурация

CoreOS позволяет предварительно сконфигурировать систему. Я собрал минимальный конфиг, так как ещё не был уверен, что мне понадобится и как всё работает. Стандартное расширение для конфига — `bu`, но для удобства редактирования его можно сохранить как `example.yml`.

```yml
variant: fcos
version: 1.6.0
passwd:
    groups:
        - name: admin
    users:
        - name: admin
          password_hash: ...
          groups:
            - admin
            - wheel
            - sudo
            - docker
        - name: workers
          groups: 
            - docker  
            - wheel
storage:
    files:
        - path: /etc/hostname
          mode: 0644
          overwrite: true
          contents:
            inline: homeserver
        - path: /etc/ssh/sshd_config.d/20-enable-passwords.conf
          mode: 0644
          contents:
              inline: |
                  # Fedora CoreOS disables SSH password login by default.
                  # Enable it.
                  # This file must sort before 40-disable-passwords.conf.
                  PasswordAuthentication yes
    links:
        - path: /etc/localtime
          target: ../usr/share/zoneinfo/Europe/Moscow        

```

Дальше конфиг нужно преобразовать в ignition формат. Формально, там будет почти тоже самое, только в json. На этом этапе с конфигурацией все, если нужно будет внести изменения, то трансформацию придется повторить.
```shell
butane --pretty --strict example.yml --output example.ign
ignition-validate example.ign && echo 'Success!'
```

## Запись образа на micro SD

Сначала подготовим дополнительные файлы для загрузки CoreOS на Raspberry Pi.

```shell
mkdir -p /tmp/RPi4boot/boot/efi/
dnf download --resolve --releasever=43 --forcearch=aarch64 --destdir=/tmp/RPi4boot/ uboot-images-armv8 bcm283x-firmware bcm283x-overlays
for rpm in /tmp/RPi4boot/*rpm; do rpm2cpio $rpm | cpio -idv -D /tmp/RPi4boot/; done
mv /tmp/RPi4boot/usr/share/uboot/rpi_arm64/u-boot.bin /tmp/RPi4boot/boot/efi/rpi-u-boot.bin
```

Затем я столкнулся с проблемой: WSL не умеет пробрасывать USB-устройства. Эту проблему можно решить с помощью [USBIPD-WIN](https://learn.microsoft.com/en-us/windows/wsl/connect-usb). Утилита устанавливается на Windows-хост. Затем в хосте нужно открыть консоль, найти нужное устройство и подключить его в WSL.

```shell
usbipd list
usbipd bind --busid 7-1
usbipd attach --wsl --busid FedoraLinux-43
```

Возвращаемся в Fedora и загружаем CoreOS на micro SD. Первая команда выведет список дисков, среди которых будет и флешка.

```shell
fdisk -l
coreos-installer install -a aarch64 -s stable -i example.ign /dev/sde
FCOSEFIPARTITION=$(lsblk /dev/sde -J -oLABEL,PATH |
                   jq -r '.blockdevices[] | select(.label == "EFI-SYSTEM") | .path')
mkdir /tmp/FCOSEFIpart
sudo mount $FCOSEFIPARTITION /tmp/FCOSEFIpart
sudo rsync -avh --ignore-existing --chown 0:0 \
        /tmp/RPi4boot/boot/efi/ /tmp/FCOSEFIpart/
sudo umount $FCOSEFIPARTITION
```

Перед извлечением флешки я на всякий случай отключал её от WSL. Но даже после этого иногда возникали проблемы, и первая попытка установки могла оказаться неудачной.

```shell
usbipd detach --busid 7-1
```

## Запуск

Теперь флешку можно вставить в Raspberry Pi и запустить. Если всё прошло успешно, CoreOS проинициализируется и предложит авторизоваться под пользователем. Процесс инициализации занимает некоторое время, я следил за ним, подключив Raspberry Pi к монитору. Сразу после запуска будет доступен SSH. Затем я подключился и смонтировал диск.

```shell
fdisk -l
fdisk /dev/sda
: n
: p
: 1
: enter
: enter
: w
mkfs -t ext4 /dev/sda1
mkdir /mnt/share
mount -t ext4 /dev/sda1 /mnt/share
vi  /etc/fstab
> /dev/sda1 /mnt/share ext4 defaults 0 0
```